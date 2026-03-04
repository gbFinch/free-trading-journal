import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTradesStore } from '@/stores';
import { getTradeExecutions } from '@/api/import';
import { getTradeCandles } from '@/api/market';
import TradeForm from '@/components/TradeForm';
import TradeCandleChart from '@/components/TradeCandleChart';
import SynchronizedCandleCharts from '@/components/SynchronizedCandleCharts';
import IntratradePnlCurve from '@/components/IntratradePnlCurve';
import clsx from 'clsx';
import type { Candle, CandleTimeframe, Execution } from '@/types';

function timeframeMinutes(timeframe: CandleTimeframe): number {
  if (timeframe === '1m') return 1;
  if (timeframe === '5m') return 5;
  return 15;
}

function aggregateCandles(candles: Candle[], bucketMinutes: number): Candle[] {
  if (bucketMinutes <= 1) return candles;

  const bucketSeconds = bucketMinutes * 60;
  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const bucketStart = candle.time - (candle.time % bucketSeconds);
    const existing = buckets.get(bucketStart);

    if (existing) {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume = (existing.volume ?? 0) + (candle.volume ?? 0);
    } else {
      buckets.set(bucketStart, {
        time: bucketStart,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0,
      });
    }
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function formatCurrency(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value);
}

function formatNumber(value: number | null, decimals = 2): string {
  if (value === null) return '-';
  if (!isFinite(value)) return 'Infinite';
  return value.toFixed(decimals);
}

function toExecutionUtcDate(executionDate: string, executionTime?: string | null): Date {
  const time = executionTime && executionTime.trim().length > 0 ? executionTime : '00:00:00';
  const safeTime = time.includes(':') ? time : '00:00:00';
  return new Date(`${executionDate}T${safeTime}Z`);
}

function parseTimeToUtcSeconds(date: string, time?: string | null): number | null {
  if (!date) return null;
  const raw = (time ?? '').trim();
  const base = raw.length > 0 ? raw : '09:30:00';
  const clean = base.split('.')[0];
  const parts = clean.split(':');
  const hour = Number(parts[0] ?? '9');
  const minute = Number(parts[1] ?? '30');
  const second = Number(parts[2] ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
    return null;
  }
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000);
}

function formatExecutionDateNY(executionDate: string, executionTime?: string | null): string {
  const dt = toExecutionUtcDate(executionDate, executionTime);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dt);
}

function formatExecutionTimeNY(executionDate: string, executionTime?: string | null): string {
  if (!executionTime) return '-';
  const dt = toExecutionUtcDate(executionDate, executionTime);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt);
}

function pnlClass(value: number | null | undefined): string {
  if ((value ?? 0) > 0) return 'text-emerald-600 dark:text-emerald-400';
  if ((value ?? 0) < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-stone-700 dark:text-stone-200';
}

function resultClass(result: string | null | undefined): string {
  if (result === 'win') return 'text-emerald-600 dark:text-emerald-400';
  if (result === 'loss') return 'text-rose-600 dark:text-rose-400';
  return 'text-stone-700 dark:text-stone-200';
}

interface DetailRowProps {
  label: string;
  value: ReactNode;
  valueClass?: string;
}

function DetailRow({ label, value, valueClass }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-stone-200 py-2.5 last:border-b-0 dark:border-stone-700">
      <span className="text-sm text-stone-500 dark:text-stone-400">{label}</span>
      <span className={clsx('text-sm font-semibold text-stone-800 dark:text-stone-100', valueClass)}>{value}</span>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}

function StatCard({ label, value, valueClass, hint }: StatCardProps) {
  return (
    <div className="app-muted-panel rounded-xl border border-stone-200/80 px-4 py-3 dark:border-stone-700/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">{label}</p>
      <p className={clsx('mt-1 text-2xl font-bold leading-none', valueClass ?? 'text-stone-900 dark:text-stone-100')}>{value}</p>
      {hint && <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{hint}</p>}
    </div>
  );
}

interface ExecutionTableProps {
  rows: Execution[];
  pnlByRow?: Array<number | null>;
  pnlLabel?: string;
}

function ExecutionTable({ rows, pnlByRow, pnlLabel = 'Scale P&L' }: ExecutionTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white/80 dark:border-stone-700 dark:bg-stone-900/50">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-stone-100/80 dark:bg-stone-800/80">
          <tr className="text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            <th className="px-3 py-2.5 font-semibold">Date</th>
            <th className="px-3 py-2.5 font-semibold">Time</th>
            <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
            <th className="px-3 py-2.5 text-right font-semibold">Price</th>
            <th className="px-3 py-2.5 text-right font-semibold">Fees</th>
            {pnlByRow && <th className="px-3 py-2.5 text-right font-semibold">{pnlLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((exec, i) => (
            <tr key={i} className="border-t border-stone-200/70 text-stone-700 dark:border-stone-700/80 dark:text-stone-200">
              <td className="px-3 py-2.5">{formatExecutionDateNY(exec.execution_date, exec.execution_time)}</td>
              <td className="px-3 py-2.5">{formatExecutionTimeNY(exec.execution_date, exec.execution_time)}</td>
              <td className="px-3 py-2.5 text-right font-medium">{exec.quantity}</td>
              <td className="px-3 py-2.5 text-right font-medium">${exec.price.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right font-medium">${exec.fees.toFixed(2)}</td>
              {pnlByRow && (
                <td className={clsx('px-3 py-2.5 text-right font-semibold', pnlClass(pnlByRow[i]))}>
                  {formatCurrency(pnlByRow[i] ?? null)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TradeDetail() {
  const timeframes: CandleTimeframe[] = ['1m', '5m', '15m'];
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [baseCandles, setBaseCandles] = useState<Candle[]>([]);
  const [underlyingBaseCandles, setUnderlyingBaseCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<CandleTimeframe>('5m');
  const [selectionResolved, setSelectionResolved] = useState(false);

  const { selectedTrade, selectTrade, deleteTrade, fetchTrades, isLoading } = useTradesStore();

  useEffect(() => {
    let isActive = true;
    setSelectionResolved(false);

    if (id) {
      const selectionResult = selectTrade(id);
      const done = () => {
        if (isActive) {
          setSelectionResolved(true);
        }
      };
      if (selectionResult && typeof (selectionResult as Promise<void>).finally === 'function') {
        void (selectionResult as Promise<void>).finally(done);
      } else {
        done();
      }
    } else {
      setSelectionResolved(true);
    }

    return () => {
      isActive = false;
      selectTrade(null);
    };
  }, [id, selectTrade]);

  useEffect(() => {
    if (id) {
      setExecutionsLoading(true);
      getTradeExecutions(id)
        .then(setExecutions)
        .catch(console.error)
        .finally(() => setExecutionsLoading(false));
    }
  }, [id]);

  const isOptionTrade = selectedTrade?.asset_class === 'option';

  const candles = useMemo(
    () => aggregateCandles(baseCandles, timeframeMinutes(chartTimeframe)),
    [baseCandles, chartTimeframe]
  );
  const underlyingCandles = useMemo(
    () => aggregateCandles(underlyingBaseCandles, timeframeMinutes(chartTimeframe)),
    [underlyingBaseCandles, chartTimeframe]
  );

  const loadCandles = useCallback((forceRefresh = false) => {
    if (!id) return;
    setCandlesLoading(true);
    setCandlesError(null);
    const optionRequest = getTradeCandles(id, '1m', forceRefresh, 'primary');
    const underlyingRequest = isOptionTrade
      ? getTradeCandles(id, '1m', forceRefresh, 'underlying')
      : Promise.resolve<Candle[]>([]);

    Promise.all([optionRequest, underlyingRequest])
      .then(([optionResult, underlyingResult]) => {
        setBaseCandles(optionResult);
        setUnderlyingBaseCandles(underlyingResult);
        if (optionResult.length === 0) {
          setCandlesError('No candles returned for this trade/timeframe.');
        }
      })
      .catch((error) => {
        console.error(error);
        setBaseCandles([]);
        setUnderlyingBaseCandles([]);
        setCandlesError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setCandlesLoading(false));
  }, [id, isOptionTrade]);

  useEffect(() => {
    loadCandles(false);
  }, [loadCandles]);

  const handleDelete = async () => {
    if (id) {
      await deleteTrade(id);
      navigate('/trades');
    }
  };

  const isTradePending = Boolean(id) && (!selectionResolved || (selectedTrade !== null && selectedTrade.id !== id));

  if (isLoading || isTradePending) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="app-panel p-10 text-center text-stone-500 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  if (!selectedTrade) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="app-panel p-10 text-center">
          <div className="py-2 text-stone-500 dark:text-stone-400">Trade not found.</div>
          <button
            onClick={() => navigate('/trades')}
            className="rounded-lg px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-900/30"
          >
            Back to trades
          </button>
        </div>
      </div>
    );
  }

  const trade = selectedTrade;
  const screenshotUrl = trade.screenshot_url;

  const entries = executions.filter(e => e.execution_type === 'entry');
  const exits = executions.filter(e => e.execution_type === 'exit');
  const resultPnlClass = pnlClass(trade.net_pnl ?? trade.gross_pnl);
  const multiplier = trade.asset_class === 'option' ? 100 : 1;
  const directionMultiplier = trade.direction === 'long' ? 1 : -1;
  const entryQtyTotal = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const entryValueTotal = entries.reduce((sum, entry) => sum + (entry.quantity * entry.price), 0);
  const entryFeesTotal = entries.reduce((sum, entry) => sum + entry.fees, 0);
  const avgEntryPrice = entryQtyTotal > 0 ? entryValueTotal / entryQtyTotal : trade.entry_price;
  const totalExitQty = exits.reduce((sum, exit) => sum + exit.quantity, 0);
  const exitScalePnls = exits.map((exit) => {
    const grossScalePnl = directionMultiplier * (exit.price - avgEntryPrice) * exit.quantity * multiplier;
    const allocatedEntryFees = totalExitQty > 0 ? (entryFeesTotal * exit.quantity) / totalExitQty : 0;
    return grossScalePnl - exit.fees - allocatedEntryFees;
  });

  const fallbackEntry: Execution[] =
    executionsLoading || entries.length > 0 || !trade.quantity
      ? []
      : [{
          execution_type: 'entry',
          execution_date: trade.trade_date,
          execution_time: trade.entry_time,
          quantity: trade.quantity,
          price: trade.entry_price,
          fees: trade.fees ?? 0,
          exchange: null,
          broker_execution_id: '',
        }];
  const displayEntries = entries.length > 0 ? entries : fallbackEntry;
  const showExecutionsSection = executionsLoading || displayEntries.length > 0 || exits.length > 0;

  const effectiveQuantity = trade.quantity
    ?? (entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.quantity, 0) : null);

  const tradeStartTs = (() => {
    if (entries.length > 0) {
      const entryTimes = entries
        .map((entry) => parseTimeToUtcSeconds(entry.execution_date, entry.execution_time))
        .filter((v): v is number => v !== null);
      if (entryTimes.length > 0) return Math.min(...entryTimes);
    }
    return parseTimeToUtcSeconds(trade.trade_date, trade.entry_time);
  })();

  const tradeEndTs = (() => {
    if (exits.length > 0) {
      const exitTimes = exits
        .map((exit) => parseTimeToUtcSeconds(exit.execution_date, exit.execution_time))
        .filter((v): v is number => v !== null);
      if (exitTimes.length > 0) return Math.max(...exitTimes);
    }
    if (trade.exit_time) {
      return parseTimeToUtcSeconds(trade.trade_date, trade.exit_time);
    }
    if (baseCandles.length > 0) {
      return baseCandles[baseCandles.length - 1].time;
    }
    return null;
  })();

  const candlesWithinTrade = (() => {
    if (tradeStartTs === null || tradeEndTs === null) return [];
    const start = Math.min(tradeStartTs, tradeEndTs);
    const end = Math.max(tradeStartTs, tradeEndTs);
    return baseCandles.filter((candle) => candle.time >= start && candle.time <= end);
  })();

  const maeMfe = (() => {
    if (candlesWithinTrade.length === 0) {
      return { maePerShare: null, mfePerShare: null, maeTotal: null, mfeTotal: null };
    }
    const minLow = Math.min(...candlesWithinTrade.map((candle) => candle.low));
    const maxHigh = Math.max(...candlesWithinTrade.map((candle) => candle.high));
    const entry = trade.entry_price;

    const maePerShare = trade.direction === 'long'
      ? Math.max(0, entry - minLow)
      : Math.max(0, maxHigh - entry);
    const mfePerShare = trade.direction === 'long'
      ? Math.max(0, maxHigh - entry)
      : Math.max(0, entry - minLow);

    const positionMultiplier = effectiveQuantity !== null ? effectiveQuantity * multiplier : null;

    return {
      maePerShare,
      mfePerShare,
      maeTotal: positionMultiplier !== null ? maePerShare * positionMultiplier : null,
      mfeTotal: positionMultiplier !== null ? mfePerShare * positionMultiplier : null,
    };
  })();

  const formatExcursionValue = (perShare: number | null, total: number | null): string => {
    if (perShare === null) return '-';
    const perShareText = `$${perShare.toFixed(2)} /share`;
    if (total === null) return perShareText;
    return `${perShareText} (${formatCurrency(total)})`;
  };

  const intratradePnlPoints = (() => {
    if (baseCandles.length === 0) return [];

    type ExecPoint = {
      time: number;
      type: 'entry' | 'exit';
      qty: number;
      price: number;
      fees: number;
    };

    const execPoints: ExecPoint[] = executions
      .map((execution) => ({
        time: parseTimeToUtcSeconds(execution.execution_date, execution.execution_time),
        type: execution.execution_type === 'exit' ? 'exit' : 'entry',
        qty: execution.quantity,
        price: execution.price,
        fees: execution.fees ?? 0,
      }))
      .filter((point): point is ExecPoint & { time: number } => point.time !== null)
      .sort((a, b) => a.time - b.time);

    const fallbackEntryTs = parseTimeToUtcSeconds(trade.trade_date, trade.entry_time);
    if (execPoints.length === 0 && fallbackEntryTs !== null && trade.quantity && trade.quantity > 0) {
      execPoints.push({
        time: fallbackEntryTs,
        type: 'entry',
        qty: trade.quantity,
        price: trade.entry_price,
        fees: trade.fees ?? 0,
      });
    }

    if (execPoints.length === 0) return [];

    const firstEntry = execPoints.find((p) => p.type === 'entry');
    const startTs = firstEntry ? firstEntry.time : execPoints[0].time;
    const lastExec = execPoints[execPoints.length - 1];
    const endTs = lastExec.time;

    const candlesInWindow = baseCandles.filter((candle) => candle.time >= startTs && candle.time <= endTs);
    if (candlesInWindow.length === 0) return [];

    const dirSign = trade.direction === 'long' ? 1 : -1;
    const contractMultiplier = trade.asset_class === 'option' ? 100 : 1;

    let execIndex = 0;
    let openQty = 0;
    let avgEntry = 0;
    let realized = 0;

    const points: Array<{ time: number; pnl: number; remainingSize: number }> = [];

    for (const candle of candlesInWindow) {
      while (execIndex < execPoints.length && execPoints[execIndex].time <= candle.time) {
        const exec = execPoints[execIndex];
        if (exec.type === 'entry') {
          const newQty = openQty + exec.qty;
          avgEntry = newQty > 0
            ? ((avgEntry * openQty) + (exec.price * exec.qty)) / newQty
            : exec.price;
          openQty = newQty;
          realized -= exec.fees;
        } else {
          const matchedQty = Math.min(openQty, exec.qty);
          if (matchedQty > 0) {
            realized += dirSign * (exec.price - avgEntry) * matchedQty * contractMultiplier;
          }
          realized -= exec.fees;
          openQty = Math.max(0, openQty - exec.qty);
          if (openQty === 0) {
            avgEntry = 0;
          }
        }
        execIndex += 1;
      }

      const unrealized = openQty > 0
        ? dirSign * (candle.close - avgEntry) * openQty * contractMultiplier
        : 0;
      points.push({ time: candle.time, pnl: realized + unrealized, remainingSize: openQty });
    }

    return points;
  })();

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6 animate-fade-in">
      <section className="app-panel overflow-hidden">
        <div className="border-b border-stone-200 bg-gradient-to-r from-teal-50 via-amber-50 to-stone-50 px-4 py-5 dark:border-stone-700 dark:from-teal-950/40 dark:via-stone-900 dark:to-stone-900 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <button
                onClick={() => navigate(-1)}
                className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
              >
                &larr; Back
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{trade.symbol}</h1>
                {trade.asset_class === 'option' && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    OPT
                  </span>
                )}
                <span
                  className={clsx(
                    'rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider',
                    trade.direction === 'long'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                  )}
                >
                  {trade.direction.toUpperCase()}
                </span>
                <span className="rounded-full border border-stone-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-stone-600 dark:border-stone-600 dark:text-stone-300">
                  {trade.status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Trade date {format(new Date(trade.trade_date), 'MMMM d, yyyy')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2 md:gap-4 md:p-6 lg:grid-cols-4">
          <StatCard
            label="Net Result"
            value={formatCompactCurrency(trade.net_pnl)}
            valueClass={resultPnlClass}
            hint={trade.result ? `Marked as ${trade.result.toUpperCase()}` : undefined}
          />
          <StatCard
            label="Gross Result"
            value={formatCompactCurrency(trade.gross_pnl)}
            valueClass={resultPnlClass}
          />
          <StatCard
            label="R Score"
            value={trade.r_multiple === null ? '-' : `${formatNumber(trade.r_multiple)}R`}
            valueClass={pnlClass(trade.r_multiple)}
            hint="Reward-to-risk ratio"
          />
          <StatCard
            label="Position Size"
            value={trade.quantity ? `${trade.quantity} ${trade.asset_class === 'option' ? 'contracts' : 'shares'}` : '-'}
            hint={trade.asset_class === 'option' ? 'Contracts' : 'Shares'}
          />
        </div>
      </section>

      {/* Edit Form Modal */}
      {isEditing && (
        <div className="animate-modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="app-panel animate-modal-pop-in max-h-[90vh] w-full max-w-2xl overflow-auto">
            <div className="flex items-center justify-between border-b border-stone-200 p-4 dark:border-stone-700">
              <h2 className="text-lg font-semibold dark:text-stone-100">Edit Trade</h2>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-md px-2 py-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              <TradeForm
                trade={trade}
                executions={executions}
                defaultAccountId={trade.account_id}
                onSuccess={() => {
                  setIsEditing(false);
                  selectTrade(trade.id);
                  fetchTrades();
                }}
                onCancel={() => setIsEditing(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="animate-modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="app-panel animate-modal-pop-in w-full max-w-md p-6">
            <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Delete Trade?</h2>
            <p className="mb-6 text-sm text-stone-600 dark:text-stone-300">
              Are you sure you want to delete this trade? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="app-panel p-4 md:p-5">
          <h2 className="mb-2 text-lg font-semibold text-stone-900 dark:text-stone-100">Trade Details</h2>
          <p className="mb-4 text-xs uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">Execution Inputs</p>
          <div className="space-y-1">
            <DetailRow label="Asset Type" value={trade.asset_class === 'option' ? 'Option' : 'Stock'} />
            <DetailRow label="Date" value={format(new Date(trade.trade_date), 'MMMM d, yyyy')} />
            <DetailRow label="Entry Price" value={`$${trade.entry_price.toFixed(2)}`} />
            <DetailRow label="Exit Price" value={trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'} />
            <DetailRow label="Quantity" value={trade.quantity?.toString() ?? '-'} />
            <DetailRow label="Stop Loss" value={trade.stop_loss_price ? `$${trade.stop_loss_price.toFixed(2)}` : '-'} />
            <DetailRow label="Fees" value={formatCurrency(trade.fees)} />
            <DetailRow label="Strategy" value={trade.strategy ?? '-'} />
            <DetailRow
              label="Screenshot URL"
              value={
                screenshotUrl
                  ? (
                    <button
                      type="button"
                      onClick={() => void openUrl(screenshotUrl)}
                      className="text-sm font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {screenshotUrl}
                    </button>
                  )
                  : '-'
              }
            />
            <DetailRow label="Status" value={trade.status.toUpperCase()} />
          </div>
        </div>

        <div className="app-panel p-4 md:p-5">
          <h2 className="mb-2 text-lg font-semibold text-stone-900 dark:text-stone-100">Performance</h2>
          <p className="mb-4 text-xs uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">Derived Metrics</p>
          <div className="space-y-1">
            <DetailRow label="Result" value={trade.result?.toUpperCase() ?? '-'} valueClass={resultClass(trade.result)} />
            <DetailRow label="Gross P&L" value={formatCurrency(trade.gross_pnl)} valueClass={pnlClass(trade.gross_pnl)} />
            <DetailRow label="Net P&L" value={formatCurrency(trade.net_pnl)} valueClass={pnlClass(trade.net_pnl)} />
            <DetailRow
              label="P&L per Share"
              value={trade.pnl_per_share ? `$${trade.pnl_per_share.toFixed(2)}` : '-'}
              valueClass={pnlClass(trade.pnl_per_share)}
            />
            <DetailRow
              label="Risk per Share"
              value={trade.risk_per_share ? `$${trade.risk_per_share.toFixed(2)}` : '-'}
            />
            <DetailRow
              label="MAE"
              value={formatExcursionValue(maeMfe.maePerShare, maeMfe.maeTotal)}
              valueClass="text-rose-600 dark:text-rose-400"
            />
            <DetailRow
              label="MFE"
              value={formatExcursionValue(maeMfe.mfePerShare, maeMfe.mfeTotal)}
              valueClass="text-emerald-600 dark:text-emerald-400"
            />
            <DetailRow label="R-Multiple" value={formatNumber(trade.r_multiple)} valueClass={pnlClass(trade.r_multiple)} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
              Intratrade P&amp;L Path
            </p>
            <IntratradePnlCurve data={intratradePnlPoints} />
          </div>
        </div>
      </section>

      <section className="app-panel overflow-hidden p-0">
          <div className="border-b border-stone-200/80 bg-gradient-to-r from-stone-100 via-emerald-50 to-teal-100 px-4 py-4 dark:border-slate-700/80 dark:from-slate-900 dark:via-emerald-950/40 dark:to-slate-900 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Trade Chart</h2>
                <p className="text-xs uppercase tracking-[0.14em] text-stone-600 dark:text-stone-300">
                  Candles with Entry and Exit Markers
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-stone-300/80 bg-white/85 p-1 backdrop-blur dark:border-slate-600/80 dark:bg-slate-900/70">
                {timeframes.map((timeframe) => (
                  <button
                    key={timeframe}
                    type="button"
                    onClick={() => setChartTimeframe(timeframe)}
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors',
                      chartTimeframe === timeframe
                        ? 'bg-slate-900 text-white dark:bg-emerald-400 dark:text-slate-950'
                        : 'text-stone-700 hover:bg-stone-100 dark:text-slate-200 dark:hover:bg-slate-800'
                    )}
                  >
                    {timeframe}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                  Long/Buy Marker
                </span>
                <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-rose-700 dark:text-rose-300">
                  Sell/Exit Marker
                </span>
                <span className="rounded-full border border-stone-300/70 bg-white/80 px-2 py-1 text-stone-600 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                  New York Time
                </span>
              </div>
              <button
                type="button"
                onClick={() => loadCandles(true)}
                disabled={candlesLoading}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
                  candlesLoading
                    ? 'cursor-not-allowed border-stone-300 bg-stone-100 text-stone-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                    : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-500 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400'
                )}
              >
                {candlesLoading ? 'Updating...' : 'Update Candles'}
              </button>
            </div>
          </div>

          <div className="px-4 py-4 md:px-5">
            <div className="relative">
              {trade.asset_class === 'option' ? (
                <SynchronizedCandleCharts
                  optionCandles={candles}
                  underlyingCandles={underlyingCandles}
                  executions={executions}
                  direction={trade.direction}
                  entryPrice={trade.entry_price}
                  stopLossPrice={trade.stop_loss_price}
                />
              ) : (
                <TradeCandleChart
                  candles={candles}
                  executions={executions}
                  direction={trade.direction}
                  entryPrice={trade.entry_price}
                  stopLossPrice={trade.stop_loss_price}
                />
              )}
              {candlesLoading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-[1px] dark:bg-slate-950/60">
                  <p className="rounded-md border border-stone-300 bg-white/95 px-3 py-1.5 text-sm font-medium text-stone-600 shadow-sm dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300">
                    Loading candles...
                  </p>
                </div>
              )}
            </div>
            {candlesError && (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{candlesError}</p>
            )}
          </div>
      </section>

      {showExecutionsSection && (
        <section className="app-panel p-4 md:p-5">
          <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-stone-100">Executions</h2>

          {executionsLoading ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">Loading executions...</p>
          ) : (
            <div className="space-y-5">
              {displayEntries.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-stone-600 dark:text-stone-300">Entries ({displayEntries.length})</h3>
                  <ExecutionTable rows={displayEntries} />
                </div>
              )}

              {exits.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-stone-600 dark:text-stone-300">Exits ({exits.length})</h3>
                  <ExecutionTable rows={exits} pnlByRow={exitScalePnls} />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {trade.notes && (
        <section className="app-panel p-4 md:p-5">
          <h2 className="mb-3 text-lg font-semibold text-stone-900 dark:text-stone-100">Notes</h2>
          <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50/70 p-4 dark:border-amber-500/70 dark:bg-amber-950/20">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-200">{trade.notes}</p>
          </div>
        </section>
      )}
    </div>
  );
}
