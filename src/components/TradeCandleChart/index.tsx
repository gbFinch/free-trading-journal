import { useEffect, useMemo, useRef } from 'react';
import {
  ColorType,
  CrosshairMode,
  createChart,
  type BaselineData,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  TickMarkType,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Direction, Execution } from '@/types';
import { useThemeStore } from '@/stores';

interface TradeCandleChartProps {
  candles: Candle[];
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

export default function TradeCandleChart({
  candles,
  executions,
  direction,
  entryPrice,
  stopLossPrice,
}: TradeCandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rewardFillSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const riskFillSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const sourceCandles = useMemo(() => candles, [candles]);

  const chartData = useMemo<CandlestickData[]>(() => {
    return [...sourceCandles]
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
  }, [sourceCandles]);

  const markers = useMemo<SeriesMarker<UTCTimestamp>[]>(() => {
    return executions.flatMap((execution) => {
      const isEntry = execution.execution_type === 'entry';
      const isBuy = (direction === 'long' && isEntry) || (direction === 'short' && !isEntry);
      const position: 'belowBar' | 'aboveBar' = isBuy ? 'belowBar' : 'aboveBar';
      const shape: 'arrowUp' | 'arrowDown' = isBuy ? 'arrowUp' : 'arrowDown';
      const color = isBuy ? '#16a34a' : '#dc2626';
      const executionTime = toExecutionTimestamp(execution);
      const markerTime = getNearestCandleTime(sourceCandles, executionTime);
      if (!Number.isFinite(markerTime)) return [];

      return [{
        time: Math.floor(markerTime) as UTCTimestamp,
        position,
        color,
        shape,
        text: `${isEntry ? 'E' : 'X'} ${execution.quantity}`,
      }];
    });
  }, [direction, executions, sourceCandles]);

  useEffect(() => {
    if (!containerRef.current) return;
    const initialWidth = Math.max(320, containerRef.current.clientWidth || 320);
    const initialHeight = Math.max(260, containerRef.current.clientHeight || 360);

    const chart = createChart(containerRef.current, {
      width: initialWidth,
      height: initialHeight,
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

    const series = chart.addCandlestickSeries({
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

    chartRef.current = chart;
    seriesRef.current = series;
    series.setData(chartData);
    series.setMarkers(markers);
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: Math.max(320, containerRef.current.clientWidth || 320),
        height: Math.max(260, containerRef.current.clientHeight || 360),
      });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (rewardFillSeriesRef.current) {
        try {
          chart.removeSeries(rewardFillSeriesRef.current);
        } catch {
          // Series may already be detached during teardown.
        }
        rewardFillSeriesRef.current = null;
      }
      if (riskFillSeriesRef.current) {
        try {
          chart.removeSeries(riskFillSeriesRef.current);
        } catch {
          // Series may already be detached during teardown.
        }
        riskFillSeriesRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
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
    });
  }, [isDark]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    if (rewardFillSeriesRef.current) {
      try {
        chart.removeSeries(rewardFillSeriesRef.current);
      } catch {
        // Ignore stale series references from previous chart instances.
      }
      rewardFillSeriesRef.current = null;
    }
    if (riskFillSeriesRef.current) {
      try {
        chart.removeSeries(riskFillSeriesRef.current);
      } catch {
        // Ignore stale series references from previous chart instances.
      }
      riskFillSeriesRef.current = null;
    }

    series.setData(chartData);
    series.setMarkers(markers);

    if (Number.isFinite(stopLossPrice)) {
      const stop = Number(stopLossPrice);
      const risk = Math.abs(entryPrice - stop);

      if (risk > 0 && chartData.length > 0) {
        const target = direction === 'long'
          ? entryPrice + 2 * risk
          : entryPrice - 2 * risk;
        const times = chartData.map((point) => point.time);

        const rewardData: BaselineData[] = times.map((time) => ({ time, value: target }));
        const riskData: BaselineData[] = times.map((time) => ({ time, value: stop }));

        const rewardAbove = target >= entryPrice;
        const riskAbove = stop >= entryPrice;

        const rewardFill = chart.addBaselineSeries({
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

        const riskFill = chart.addBaselineSeries({
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

    const preferredRange = getTradeVisibleRange(executions, chartData);
    if (preferredRange) {
      chart.timeScale().setVisibleRange(preferredRange);
    } else {
      chart.timeScale().fitContent();
    }
  }, [chartData, markers, isDark, direction, entryPrice, stopLossPrice]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[380px] w-full rounded-xl border border-stone-200/80 bg-white dark:border-slate-700 dark:bg-slate-950"
      />
      {chartData.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
          No candle data available for this trade.
        </div>
      )}
    </div>
  );
}
