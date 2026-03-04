import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  createChart,
  type BaselineData,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  TickMarkType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Direction, Execution } from '@/types';
import { useThemeStore } from '@/stores';

interface SynchronizedCandleChartsProps {
  optionCandles: Candle[];
  underlyingCandles: Candle[];
  executions: Execution[];
  direction: Direction;
  entryPrice: number;
  stopLossPrice?: number | null;
}

function toExecutionTimestamp(execution: Execution): number {
  const [year, month, day] = execution.execution_date.split('-').map(Number);
  const rawTime = execution.execution_time ?? '09:30:00';
  const clean = rawTime.split('.')[0];
  const [hour = 9, minute = 30, second = 0] = clean.split(':').map(Number);
  return Math.floor(Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour, minute, second) / 1000);
}

function getNearestCandleTime(candles: Candle[], executionTime: number): number {
  if (candles.length === 0) return executionTime;
  let nearest = candles[0].time;
  let minDelta = Math.abs(nearest - executionTime);
  for (let i = 1; i < candles.length; i++) {
    const delta = Math.abs(candles[i].time - executionTime);
    if (delta < minDelta) {
      nearest = candles[i].time;
      minDelta = delta;
    }
  }
  return nearest;
}

function toUnixSeconds(time: unknown): number | null {
  if (typeof time === 'number' && Number.isFinite(time)) {
    return Math.floor(time);
  }
  if (typeof time === 'string') {
    const parsed = Date.parse(time);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  if (time && typeof time === 'object') {
    const t = time as { year?: number; month?: number; day?: number };
    if (t.year && t.month && t.day) {
      return Math.floor(Date.UTC(t.year, t.month - 1, t.day, 0, 0, 0) / 1000);
    }
  }
  return null;
}

function formatNyTime(unixSeconds: number, includeDate = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: includeDate ? '2-digit' : undefined,
    day: includeDate ? '2-digit' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(unixSeconds * 1000));
}

function toChartData(candles: Candle[]): CandlestickData[] {
  return [...candles]
    .filter((candle) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    )
    .map((candle) => {
      const high = Math.max(candle.open, candle.high, candle.low, candle.close);
      const low = Math.min(candle.open, candle.high, candle.low, candle.close);
      return {
        time: Math.floor(candle.time) as UTCTimestamp,
        open: candle.open,
        high,
        low,
        close: candle.close,
      };
    })
    .sort((a, b) => Number(a.time) - Number(b.time));
}

function priceAtTimestamp(data: CandlestickData[], timestamp: number): number | null {
  if (data.length === 0) return null;
  let nearest: CandlestickData = data[0];
  let minDelta = Math.abs(Number(nearest.time) - timestamp);
  for (let i = 1; i < data.length; i++) {
    const delta = Math.abs(Number(data[i].time) - timestamp);
    if (delta < minDelta) {
      nearest = data[i];
      minDelta = delta;
    }
  }
  return nearest.close;
}

function getTradeVisibleRange(
  executions: Execution[],
  chartData: CandlestickData[],
): { from: UTCTimestamp; to: UTCTimestamp } | null {
  const executionTimes = executions
    .map(toExecutionTimestamp)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (executionTimes.length === 0) {
    return null;
  }

  const dataTimes = chartData.map((point) => Number(point.time)).sort((a, b) => a - b);
  if (dataTimes.length === 0) {
    return null;
  }

  const firstData = dataTimes[0];
  const lastData = dataTimes[dataTimes.length - 1];
  const fromExec = executionTimes[0];
  const toExec = executionTimes[executionTimes.length - 1];

  const sampleStep = dataTimes.length > 1 ? Math.max(60, dataTimes[1] - dataTimes[0]) : 60;
  const padding = sampleStep * 2;
  const from = Math.max(firstData, fromExec - padding);
  const to = Math.min(lastData, toExec + padding);
  if (to < from) return null;

  return {
    from: from as UTCTimestamp,
    to: to as UTCTimestamp,
  };
}

export default function SynchronizedCandleCharts({
  optionCandles,
  underlyingCandles,
  executions,
  direction,
  entryPrice,
  stopLossPrice,
}: SynchronizedCandleChartsProps) {
  const optionContainerRef = useRef<HTMLDivElement | null>(null);
  const underlyingContainerRef = useRef<HTMLDivElement | null>(null);

  const optionChartRef = useRef<IChartApi | null>(null);
  const optionSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const underlyingChartRef = useRef<IChartApi | null>(null);
  const underlyingSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rewardFillSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const riskFillSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);

  const syncingRangeRef = useRef(false);
  const syncingCrosshairRef = useRef(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const optionData = useMemo(() => toChartData(optionCandles), [optionCandles]);
  const underlyingData = useMemo(() => toChartData(underlyingCandles), [underlyingCandles]);

  const optionMarkers = useMemo<SeriesMarker<UTCTimestamp>[]>(() => {
    return executions.flatMap((execution) => {
      const isEntry = execution.execution_type === 'entry';
      const isBuy = (direction === 'long' && isEntry) || (direction === 'short' && !isEntry);
      const position: 'belowBar' | 'aboveBar' = isBuy ? 'belowBar' : 'aboveBar';
      const shape: 'arrowUp' | 'arrowDown' = isBuy ? 'arrowUp' : 'arrowDown';
      const color = isBuy ? '#16a34a' : '#dc2626';
      const executionTime = toExecutionTimestamp(execution);
      const markerTime = getNearestCandleTime(optionCandles, executionTime);
      if (!Number.isFinite(markerTime)) return [];

      return [{
        time: Math.floor(markerTime) as UTCTimestamp,
        position,
        color,
        shape,
        text: `${isEntry ? 'E' : 'X'} ${execution.quantity}`,
      }];
    });
  }, [direction, executions, optionCandles]);

  useEffect(() => {
    if (!optionContainerRef.current || !underlyingContainerRef.current) return;
    setChartError(null);

    const createStyledChart = (container: HTMLDivElement, height: number) => createChart(container, {
      width: Math.max(320, container.clientWidth || 320),
      height,
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? '#020617' : '#ffffff',
        },
        textColor: isDark ? '#cbd5e1' : '#334155',
      },
      grid: {
        vertLines: { color: isDark ? '#1e293b' : '#e2e8f0' },
        horzLines: { color: isDark ? '#1e293b' : '#e2e8f0' },
      },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        borderColor: isDark ? '#334155' : '#cbd5e1',
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        borderColor: isDark ? '#334155' : '#cbd5e1',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: unknown, tickMarkType: TickMarkType) => {
          const unix = toUnixSeconds(time);
          if (unix === null) return '';
          const includeDate = tickMarkType === TickMarkType.DayOfMonth || tickMarkType === TickMarkType.Month || tickMarkType === TickMarkType.Year;
          return formatNyTime(unix, includeDate);
        },
      },
      localization: {
        timeFormatter: (time: unknown) => {
          const unix = toUnixSeconds(time);
          if (unix === null) return '';
          return formatNyTime(unix, true);
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: isDark ? '#64748b' : '#94a3b8' },
        horzLine: { color: isDark ? '#64748b' : '#94a3b8' },
      },
    });

    let optionChart: IChartApi;
    let underlyingChart: IChartApi;
    try {
      optionChart = createStyledChart(optionContainerRef.current, 250);
      underlyingChart = createStyledChart(underlyingContainerRef.current, 250);
    } catch (error) {
      console.error('Failed to initialize synchronized charts:', error);
      setChartError('Unable to initialize synchronized charts.');
      return;
    }

    const optionSeries = optionChart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#f43f5e',
      borderVisible: true,
      borderUpColor: '#22c55e',
      borderDownColor: '#f43f5e',
      wickUpColor: '#22c55e',
      wickDownColor: '#f43f5e',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
      priceLineVisible: false,
    });

    const underlyingSeries = underlyingChart.addCandlestickSeries({
      upColor: '#06b6d4',
      downColor: '#f97316',
      borderVisible: true,
      borderUpColor: '#06b6d4',
      borderDownColor: '#f97316',
      wickUpColor: '#06b6d4',
      wickDownColor: '#f97316',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
      priceLineVisible: false,
    });

    optionChartRef.current = optionChart;
    optionSeriesRef.current = optionSeries;
    underlyingChartRef.current = underlyingChart;
    underlyingSeriesRef.current = underlyingSeries;

    const optionResizeObserver = new ResizeObserver(() => {
      if (!optionContainerRef.current) return;
      optionChart.applyOptions({
        width: Math.max(320, optionContainerRef.current.clientWidth || 320),
      });
    });
    optionResizeObserver.observe(optionContainerRef.current);

    const underlyingResizeObserver = new ResizeObserver(() => {
      if (!underlyingContainerRef.current) return;
      underlyingChart.applyOptions({
        width: Math.max(320, underlyingContainerRef.current.clientWidth || 320),
      });
    });
    underlyingResizeObserver.observe(underlyingContainerRef.current);

    return () => {
      optionResizeObserver.disconnect();
      underlyingResizeObserver.disconnect();

      if (rewardFillSeriesRef.current) {
        try {
          optionChart.removeSeries(rewardFillSeriesRef.current);
        } catch {
          // Ignore stale series refs during teardown.
        }
        rewardFillSeriesRef.current = null;
      }
      if (riskFillSeriesRef.current) {
        try {
          optionChart.removeSeries(riskFillSeriesRef.current);
        } catch {
          // Ignore stale series refs during teardown.
        }
        riskFillSeriesRef.current = null;
      }

      try {
        optionChart.remove();
      } catch {
        // Ignore teardown errors.
      }
      try {
        underlyingChart.remove();
      } catch {
        // Ignore teardown errors.
      }
      optionChartRef.current = null;
      optionSeriesRef.current = null;
      underlyingChartRef.current = null;
      underlyingSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const optionChart = optionChartRef.current;
    const underlyingChart = underlyingChartRef.current;
    if (!optionChart || !underlyingChart) return;

    const themeOptions = {
      layout: {
        background: {
          type: ColorType.Solid as const,
          color: isDark ? '#020617' : '#ffffff',
        },
        textColor: isDark ? '#cbd5e1' : '#334155',
      },
      grid: {
        vertLines: { color: isDark ? '#1e293b' : '#e2e8f0' },
        horzLines: { color: isDark ? '#1e293b' : '#e2e8f0' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#334155' : '#cbd5e1',
      },
      timeScale: {
        borderColor: isDark ? '#334155' : '#cbd5e1',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: isDark ? '#64748b' : '#94a3b8' },
        horzLine: { color: isDark ? '#64748b' : '#94a3b8' },
      },
    };

    optionChart.applyOptions(themeOptions);
    underlyingChart.applyOptions(themeOptions);
  }, [isDark]);

  useEffect(() => {
    const optionChart = optionChartRef.current;
    const optionSeries = optionSeriesRef.current;
    const underlyingChart = underlyingChartRef.current;
    const underlyingSeries = underlyingSeriesRef.current;
    if (!optionChart || !optionSeries || !underlyingChart || !underlyingSeries) return;

    if (rewardFillSeriesRef.current) {
      try {
        optionChart.removeSeries(rewardFillSeriesRef.current);
      } catch {
        // Ignore stale series refs during updates.
      }
      rewardFillSeriesRef.current = null;
    }
    if (riskFillSeriesRef.current) {
      try {
        optionChart.removeSeries(riskFillSeriesRef.current);
      } catch {
        // Ignore stale series refs during updates.
      }
      riskFillSeriesRef.current = null;
    }

    try {
      optionSeries.setData(optionData);
      optionSeries.setMarkers(optionMarkers);
      underlyingSeries.setData(underlyingData);
      underlyingSeries.setMarkers([]);
    } catch (error) {
      console.error('Failed to apply synchronized chart data:', error);
      setChartError('Unable to render synchronized charts.');
      return;
    }

    if (Number.isFinite(stopLossPrice)) {
      const stop = Number(stopLossPrice);
      const risk = Math.abs(entryPrice - stop);

      if (risk > 0 && optionData.length > 0) {
        const target = direction === 'long'
          ? entryPrice + 2 * risk
          : entryPrice - 2 * risk;
        const times = optionData.map((point) => point.time);

        const rewardData: BaselineData[] = times.map((time) => ({ time, value: target }));
        const riskData: BaselineData[] = times.map((time) => ({ time, value: stop }));

        const rewardAbove = target >= entryPrice;
        const riskAbove = stop >= entryPrice;

        const rewardFill = optionChart.addBaselineSeries({
          baseValue: { type: 'price', price: entryPrice },
          lineVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          topFillColor1: rewardAbove ? 'rgba(16, 185, 129, 0.28)' : 'rgba(0, 0, 0, 0)',
          topFillColor2: rewardAbove ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0, 0, 0, 0)',
          bottomFillColor1: rewardAbove ? 'rgba(0, 0, 0, 0)' : 'rgba(16, 185, 129, 0.28)',
          bottomFillColor2: rewardAbove ? 'rgba(0, 0, 0, 0)' : 'rgba(16, 185, 129, 0.12)',
          topLineColor: 'rgba(0, 0, 0, 0)',
          bottomLineColor: 'rgba(0, 0, 0, 0)',
        });
        rewardFill.setData(rewardData);
        rewardFillSeriesRef.current = rewardFill;

        const riskFill = optionChart.addBaselineSeries({
          baseValue: { type: 'price', price: entryPrice },
          lineVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          topFillColor1: riskAbove ? 'rgba(244, 63, 94, 0.24)' : 'rgba(0, 0, 0, 0)',
          topFillColor2: riskAbove ? 'rgba(244, 63, 94, 0.10)' : 'rgba(0, 0, 0, 0)',
          bottomFillColor1: riskAbove ? 'rgba(0, 0, 0, 0)' : 'rgba(244, 63, 94, 0.24)',
          bottomFillColor2: riskAbove ? 'rgba(0, 0, 0, 0)' : 'rgba(244, 63, 94, 0.10)',
          topLineColor: 'rgba(0, 0, 0, 0)',
          bottomLineColor: 'rgba(0, 0, 0, 0)',
        });
        riskFill.setData(riskData);
        riskFillSeriesRef.current = riskFill;
      }
    }

    try {
      const preferredRange = getTradeVisibleRange(executions, optionData);
      if (preferredRange) {
        optionChart.timeScale().setVisibleRange(preferredRange);
        underlyingChart.timeScale().setVisibleRange(preferredRange);
      } else {
        optionChart.timeScale().fitContent();
        const range = optionChart.timeScale().getVisibleRange();
        if (range) {
          underlyingChart.timeScale().setVisibleRange(range);
        } else {
          underlyingChart.timeScale().fitContent();
        }
      }
    } catch (error) {
      console.error('Failed to sync initial chart range:', error);
    }
  }, [optionData, underlyingData, optionMarkers, direction, entryPrice, stopLossPrice, executions]);

  useEffect(() => {
    const optionChart = optionChartRef.current;
    const optionSeries = optionSeriesRef.current;
    const underlyingChart = underlyingChartRef.current;
    const underlyingSeries = underlyingSeriesRef.current;
    if (!optionChart || !optionSeries || !underlyingChart || !underlyingSeries) return;

    const onOptionRange = (range: ReturnType<IChartApi['timeScale']> extends { getVisibleRange: () => infer R } ? R : never) => {
      if (!range || syncingRangeRef.current) return;
      syncingRangeRef.current = true;
      try {
        underlyingChart.timeScale().setVisibleRange(range);
      } catch {
        // Ignore transient sync errors while target chart is still initializing.
      }
      syncingRangeRef.current = false;
    };
    const onUnderlyingRange = (range: ReturnType<IChartApi['timeScale']> extends { getVisibleRange: () => infer R } ? R : never) => {
      if (!range || syncingRangeRef.current) return;
      syncingRangeRef.current = true;
      try {
        optionChart.timeScale().setVisibleRange(range);
      } catch {
        // Ignore transient sync errors while target chart is still initializing.
      }
      syncingRangeRef.current = false;
    };

    try {
      optionChart.timeScale().subscribeVisibleTimeRangeChange(onOptionRange);
      underlyingChart.timeScale().subscribeVisibleTimeRangeChange(onUnderlyingRange);
    } catch (error) {
      console.error('Failed to subscribe chart range sync:', error);
      setChartError('Unable to synchronize chart ranges.');
      return;
    }

    const onOptionCrosshair = (param: MouseEventParams<Time>) => {
      if (syncingCrosshairRef.current) return;
      syncingCrosshairRef.current = true;
      if (!param.time || underlyingData.length === 0) {
        underlyingChart.clearCrosshairPosition();
      } else {
        const time = toUnixSeconds(param.time);
        const price = time === null ? null : priceAtTimestamp(underlyingData, time);
        if (price !== null) {
          try {
            underlyingChart.setCrosshairPosition(price, param.time, underlyingSeries);
          } catch {
            underlyingChart.clearCrosshairPosition();
          }
        }
      }
      syncingCrosshairRef.current = false;
    };

    const onUnderlyingCrosshair = (param: MouseEventParams<Time>) => {
      if (syncingCrosshairRef.current) return;
      syncingCrosshairRef.current = true;
      if (!param.time || optionData.length === 0) {
        optionChart.clearCrosshairPosition();
      } else {
        const time = toUnixSeconds(param.time);
        const price = time === null ? null : priceAtTimestamp(optionData, time);
        if (price !== null) {
          try {
            optionChart.setCrosshairPosition(price, param.time, optionSeries);
          } catch {
            optionChart.clearCrosshairPosition();
          }
        }
      }
      syncingCrosshairRef.current = false;
    };

    try {
      optionChart.subscribeCrosshairMove(onOptionCrosshair);
      underlyingChart.subscribeCrosshairMove(onUnderlyingCrosshair);
    } catch (error) {
      console.error('Failed to subscribe crosshair sync:', error);
      setChartError('Unable to synchronize chart crosshair.');
      return;
    }

    return () => {
      optionChart.timeScale().unsubscribeVisibleTimeRangeChange(onOptionRange);
      underlyingChart.timeScale().unsubscribeVisibleTimeRangeChange(onUnderlyingRange);
      optionChart.unsubscribeCrosshairMove(onOptionCrosshair);
      underlyingChart.unsubscribeCrosshairMove(onUnderlyingCrosshair);
      optionChart.clearCrosshairPosition();
      underlyingChart.clearCrosshairPosition();
    };
  }, [optionData, underlyingData]);

  if (chartError) {
    return (
      <div className="rounded-xl border border-rose-300/70 bg-rose-50/80 p-4 text-sm text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/20 dark:text-rose-300">
        {chartError}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-stone-200/80 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-950/40">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-slate-400">
          Option Contract
        </p>
        <div className="relative">
          <div
            ref={optionContainerRef}
            className="h-[250px] w-full rounded-xl border border-stone-200/80 bg-white dark:border-slate-700 dark:bg-slate-950"
          />
          {optionData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
              No option candle data available.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200/80 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-950/40">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-slate-400">
          Underlying
        </p>
        <div className="relative">
          <div
            ref={underlyingContainerRef}
            className="h-[250px] w-full rounded-xl border border-stone-200/80 bg-white dark:border-slate-700 dark:bg-slate-950"
          />
          {underlyingData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
              No underlying candle data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
