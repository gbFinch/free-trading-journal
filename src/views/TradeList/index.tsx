import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useTradesStore, useAccountsStore, useImportStore } from '@/stores';
import TradeForm from '@/components/TradeForm';
import ImportDialog from '@/components/ImportDialog';
import clsx from 'clsx';
import type { TradeWithDerived } from '@/types';

function formatCurrency(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value);
}

function parseTimeToMinutes(time: string): number | null {
  const parts = time.split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getTradeDurationMinutes(entryTime: string | null, exitTime: string | null): number | null {
  if (!entryTime || !exitTime) return null;

  const entryMinutes = parseTimeToMinutes(entryTime);
  const exitMinutes = parseTimeToMinutes(exitTime);
  if (entryMinutes === null || exitMinutes === null) return null;

  let diff = exitMinutes - entryMinutes;
  if (diff < 0) {
    diff += 24 * 60;
  }
  return diff;
}

function formatTradeDuration(entryTime: string | null, exitTime: string | null): string {
  const totalMinutes = getTradeDurationMinutes(entryTime, exitTime);
  if (totalMinutes === null) return '-';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

type DensityMode = 'tight' | 'comfortable';
type ViewPreset = 'all' | 'wins' | 'losses' | 'open';
type NetPnlSortMode = 'none' | 'desc' | 'asc';
type DurationSortMode = 'none' | 'desc' | 'asc';

function normalizeDurationForSort(entryTime: string | null, exitTime: string | null): number {
  const minutes = getTradeDurationMinutes(entryTime, exitTime);
  return minutes === null ? -1 : minutes;
}

function nextSortMode(current: 'none' | 'desc' | 'asc'): 'none' | 'desc' | 'asc' {
  if (current === 'none') return 'desc';
  if (current === 'desc') return 'asc';
  return 'none';
}

function sortArrow(mode: 'none' | 'desc' | 'asc'): string {
  if (mode === 'desc') return '▼';
  if (mode === 'asc') return '▲';
  return '↕';
}

function rowSpacingClass(density: DensityMode): string {
  return density === 'tight' ? 'py-2' : 'py-3';
}

interface TradeRowProps {
  trade: TradeWithDerived;
  index: number;
  density: DensityMode;
  isSelected: boolean;
  onToggleSelect: (tradeId: string) => void;
  onClick: () => void;
}

function TradeRow({ trade, index, density, isSelected, onToggleSelect, onClick }: TradeRowProps) {
  const pad = rowSpacingClass(density);
  const netPnl = trade.net_pnl ?? 0;
  const showMetaTags = density === 'comfortable';

  return (
    <tr
      onClick={onClick}
      className={clsx(
        'group cursor-pointer border-b border-stone-200/80 transition-all dark:border-stone-700/80',
        index % 2 === 0 ? 'bg-white/80 dark:bg-stone-900/55' : 'bg-stone-50/55 dark:bg-stone-900/35',
        'hover:bg-teal-50/70 hover:shadow-[inset_4px_0_0_0_rgba(13,148,136,0.45)] dark:hover:bg-teal-900/20',
        isSelected && 'bg-teal-100/70 shadow-[inset_4px_0_0_0_rgba(13,148,136,0.7)] dark:bg-teal-900/30'
      )}
    >
      <td className={clsx('sticky left-0 z-20 w-12 whitespace-nowrap border-r border-stone-200/70 bg-inherit px-4 dark:border-stone-700/70', pad)}>
        <input
          type="checkbox"
          aria-label={`Select trade ${trade.symbol} on ${trade.trade_date}`}
          checked={isSelected}
          onChange={() => onToggleSelect(trade.id)}
          onClick={event => event.stopPropagation()}
          className="h-4 w-4 rounded border-stone-300 text-teal-700 focus:ring-teal-500"
        />
      </td>
      <td className={clsx('sticky left-12 z-20 w-40 whitespace-nowrap border-r border-stone-200/70 bg-inherit px-4 text-sm font-medium text-stone-700 dark:border-stone-700/70 dark:text-stone-300', pad)}>
        {format(new Date(trade.trade_date), 'MMM d, yyyy')}
      </td>
      <td className={clsx('min-w-[220px] px-4', pad)}>
        <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
          <span>{trade.symbol}</span>
          {trade.asset_class === 'option' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
              OPT
            </span>
          )}
        </div>
        {showMetaTags && (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {trade.strategy && <span className="rounded bg-stone-200/70 px-1.5 py-0.5 dark:bg-stone-700/70">{trade.strategy}</span>}
            <span className="rounded bg-stone-200/70 px-1.5 py-0.5 dark:bg-stone-700/70">{trade.status}</span>
          </div>
        )}
      </td>
      <td className={clsx('whitespace-nowrap px-4', pad)}>
        <span
          className={clsx(
            'rounded px-2 py-1 text-xs font-medium',
            trade.direction === 'long'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          )}
        >
          {trade.direction.toUpperCase()}
        </span>
      </td>
      <td className={clsx('whitespace-nowrap px-4 text-right text-sm text-stone-700 dark:text-stone-200', pad)}>${trade.entry_price.toFixed(2)}</td>
      <td className={clsx('whitespace-nowrap px-4 text-right text-sm text-stone-600 dark:text-stone-300', pad)}>{trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}</td>
      <td className={clsx('whitespace-nowrap px-4 text-right text-sm text-stone-600 dark:text-stone-300', pad)}>{trade.quantity?.toFixed(0) ?? '-'}</td>
      <td className={clsx('whitespace-nowrap px-4 text-right text-sm text-stone-600 dark:text-stone-300', pad)}>
        {formatTradeDuration(trade.entry_time, trade.exit_time)}
      </td>
      <td className={clsx('whitespace-nowrap px-4 text-right font-semibold', pad, netPnl > 0 ? 'text-green-600 dark:text-green-400' : netPnl < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')}>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="text-xs">{netPnl > 0 ? '▲' : netPnl < 0 ? '▼' : '•'}</span>
          <span>{formatCurrency(trade.net_pnl)}</span>
        </span>
      </td>
      <td className={clsx('whitespace-nowrap px-4', pad)}>
        {trade.result && (
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium',
              trade.result === 'win'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : trade.result === 'loss'
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                : 'bg-stone-100 text-stone-800 dark:bg-stone-700 dark:text-stone-200'
            )}
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {trade.result.toUpperCase()}
          </span>
        )}
      </td>
    </tr>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  icon: ReactNode;
}

function StatCard({ label, value, valueClass, hint, icon }: StatCardProps) {
  return (
    <div className="app-muted-panel rounded-xl border border-stone-200/80 px-4 py-3 dark:border-stone-700/70">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">{label}</p>
        <span className="text-stone-400 dark:text-stone-500">{icon}</span>
      </div>
      <p className={clsx('mt-1 text-2xl font-bold leading-none text-stone-900 dark:text-stone-100', valueClass)}>{value}</p>
      {hint && <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{hint}</p>}
    </div>
  );
}

export default function TradeList() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedTradeIds, setSelectedTradeIds] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<DensityMode>('tight');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('all');
  const [netPnlSort, setNetPnlSort] = useState<NetPnlSortMode>('none');
  const [durationSort, setDurationSort] = useState<DurationSortMode>('none');

  const { trades, fetchTrades, deleteTrades, isLoading } = useTradesStore();
  const { accounts, selectedAccountId } = useAccountsStore();
  const { openDialog: openImportDialog } = useImportStore();

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const visibleTrades = useMemo(() => {
    if (viewPreset === 'wins') return trades.filter(trade => trade.result === 'win');
    if (viewPreset === 'losses') return trades.filter(trade => trade.result === 'loss');
    if (viewPreset === 'open') return trades.filter(trade => trade.status === 'open');
    return trades;
  }, [trades, viewPreset]);

  const orderedTrades = useMemo(() => {
    if (durationSort !== 'none') {
      const sorted = [...visibleTrades].sort(
        (a, b) => normalizeDurationForSort(a.entry_time, a.exit_time) - normalizeDurationForSort(b.entry_time, b.exit_time)
      );
      return durationSort === 'asc' ? sorted : sorted.reverse();
    }

    if (netPnlSort !== 'none') {
      const sorted = [...visibleTrades].sort((a, b) => (a.net_pnl ?? 0) - (b.net_pnl ?? 0));
      return netPnlSort === 'asc' ? sorted : sorted.reverse();
    }

    return visibleTrades;
  }, [visibleTrades, netPnlSort, durationSort]);

  useEffect(() => {
    setSelectedTradeIds(current => {
      const validIds = new Set(orderedTrades.map(trade => trade.id));
      const next = new Set(Array.from(current).filter(id => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [orderedTrades]);

  const stats = useMemo(() => {
    const totalNet = orderedTrades.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);
    const closedCount = orderedTrades.filter(t => t.status === 'closed').length;
    const winCount = orderedTrades.filter(t => t.result === 'win').length;
    const resolvedCount = orderedTrades.filter(t => t.result !== null).length;
    const winRate = resolvedCount > 0 ? `${((winCount / resolvedCount) * 100).toFixed(0)}%` : '-';

    return {
      totalNet,
      closedCount,
      winRate,
      resolvedCount,
    };
  }, [orderedTrades]);

  const allSelected = orderedTrades.length > 0 && selectedTradeIds.size === orderedTrades.length;

  const toggleTradeSelection = (tradeId: string) => {
    setSelectedTradeIds(current => {
      const next = new Set(current);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedTradeIds(new Set());
      return;
    }
    setSelectedTradeIds(new Set(orderedTrades.map(trade => trade.id)));
  };

  const toggleNetPnlSort = () => {
    setNetPnlSort(current => nextSortMode(current));
    setDurationSort('none');
  };

  const toggleDurationSort = () => {
    setDurationSort(current => nextSortMode(current));
    setNetPnlSort('none');
  };

  const handleBulkDelete = async () => {
    try {
      const ids = Array.from(selectedTradeIds);
      await deleteTrades(ids);
      setSelectedTradeIds(new Set());
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete selected trades', error);
    }
  };

  const defaultAccountId = selectedAccountId ?? accounts[0]?.id ?? '';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 animate-fade-in">
      <section className="app-panel overflow-hidden">
        <div className="border-b border-stone-200 bg-gradient-to-r from-teal-50 via-amber-50 to-stone-50 px-4 py-5 dark:border-stone-700 dark:from-teal-950/40 dark:via-stone-900 dark:to-stone-900 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Trades</h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">Review, compare, and manage every trade from one surface.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={openImportDialog} className="app-secondary-btn">Import</button>
              <button onClick={() => setShowForm(true)} className="app-primary-btn">+ New Trade</button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2 md:gap-4 md:p-6 lg:grid-cols-4">
          <StatCard
            label="Total Trades"
            value={String(orderedTrades.length)}
            hint={orderedTrades.length === 1 ? 'Trade in current view' : 'Trades in current view'}
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 12h16M4 19h16" />
              </svg>
            }
          />
          <StatCard
            label="Closed Trades"
            value={String(stats.closedCount)}
            hint="Positions with completed lifecycle"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            }
          />
          <StatCard
            label="Win Rate"
            value={stats.winRate}
            hint={stats.resolvedCount > 0 ? `${stats.resolvedCount} resolved results` : 'No resolved results yet'}
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4 3 3 5-7 4 5" />
              </svg>
            }
          />
          <StatCard
            label="Portfolio Net"
            value={formatCompactCurrency(stats.totalNet)}
            valueClass={stats.totalNet > 0 ? 'text-emerald-600 dark:text-emerald-400' : stats.totalNet < 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
            hint="Aggregate net outcome"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
              </svg>
            }
          />
        </div>
      </section>

      {showForm && (
        <div className="animate-modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="app-panel animate-modal-pop-in max-h-[90vh] w-full max-w-2xl overflow-auto">
            <div className="flex items-center justify-between border-b border-stone-200 p-4 dark:border-stone-700">
              <h2 className="text-lg font-semibold dark:text-stone-100">New Trade</h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">&times;</button>
            </div>
            <div className="p-4">
              <TradeForm
                defaultAccountId={defaultAccountId}
                onSuccess={() => {
                  setShowForm(false);
                  fetchTrades();
                }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {isLoading && <div className="app-panel py-10 text-center text-stone-500 dark:text-stone-400">Loading...</div>}

      {!isLoading && trades.length === 0 && (
        <div className="app-panel py-16 text-center text-stone-500 dark:text-stone-400">
          <p>No trades found.</p>
          <p className="mt-2">Click "New Trade" to add your first trade!</p>
        </div>
      )}

      {!isLoading && trades.length > 0 && (
        <section className="app-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-700">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400" htmlFor="view-preset">View</label>
              <select
                id="view-preset"
                value={viewPreset}
                onChange={event => setViewPreset(event.target.value as ViewPreset)}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              >
                <option value="all">All trades</option>
                <option value="wins">Winners</option>
                <option value="losses">Losers</option>
                <option value="open">Open only</option>
              </select>
              <div className="ml-2 flex items-center gap-1 rounded-lg border border-stone-300 bg-stone-100 p-1 dark:border-stone-600 dark:bg-stone-800">
                <button
                  onClick={() => setDensity('tight')}
                  className={clsx('rounded px-2 py-1 text-xs font-medium transition-colors', density === 'tight' ? 'bg-white text-stone-800 shadow-sm dark:bg-stone-700 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400')}
                >
                  Tight
                </button>
                <button
                  onClick={() => setDensity('comfortable')}
                  className={clsx('rounded px-2 py-1 text-xs font-medium transition-colors', density === 'comfortable' ? 'bg-white text-stone-800 shadow-sm dark:bg-stone-700 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400')}
                >
                  Comfortable
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {selectedTradeIds.size > 0 ? `${selectedTradeIds.size} selected` : 'Select trades to perform bulk actions'}
              </p>
              <button onClick={toggleSelectAll} className="app-secondary-btn px-3 py-1.5 text-sm">
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={selectedTradeIds.size === 0}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete selected
              </button>
            </div>
          </div>

          <div className="max-h-[65vh] overflow-auto">
            <table className="min-w-full border-separate border-spacing-y-0">
              <thead className="sticky top-0 z-30 bg-stone-50/95 backdrop-blur dark:bg-stone-900/95">
                <tr>
                  <th className="sticky left-0 z-40 w-12 border-b border-r border-stone-200 bg-stone-50/95 px-4 py-2 text-left dark:border-stone-700 dark:bg-stone-900/95">
                    <input
                      type="checkbox"
                      aria-label="Select all trades"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-stone-300 text-teal-700 focus:ring-teal-500"
                    />
                  </th>
                  <th className="sticky left-12 z-40 w-40 border-b border-r border-stone-200 bg-stone-50/95 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-400">Date</th>
                  <th className="border-b border-stone-200 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">Symbol</th>
                  <th className="border-b border-stone-200 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">Direction</th>
                  <th className="border-b border-stone-200 px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">Entry</th>
                  <th className="border-b border-stone-200 px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">Exit</th>
                  <th className="border-b border-stone-200 px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">Qty</th>
                  <th className="border-b border-stone-200 px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">
                    <button
                      onClick={toggleDurationSort}
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-stone-200/70 dark:hover:bg-stone-700/60"
                      title="Sort by Duration"
                    >
                      Duration
                      <span aria-hidden="true" className="text-[10px]">
                        {sortArrow(durationSort)}
                      </span>
                    </button>
                  </th>
                  <th className="border-b border-stone-200 px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">
                    <button
                      onClick={toggleNetPnlSort}
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-stone-200/70 dark:hover:bg-stone-700/60"
                      title="Sort by Net P&L"
                    >
                      Net P&L
                      <span aria-hidden="true" className="text-[10px]">
                        {sortArrow(netPnlSort)}
                      </span>
                    </button>
                  </th>
                  <th className="border-b border-stone-200 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">Result</th>
                </tr>
              </thead>
              <tbody>
                {orderedTrades.map((trade, index) => (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    index={index}
                    density={density}
                    isSelected={selectedTradeIds.has(trade.id)}
                    onToggleSelect={toggleTradeSelection}
                    onClick={() => navigate(`/trades/${trade.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showBulkDeleteConfirm && (
        <div className="animate-modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="app-panel animate-modal-pop-in max-w-md p-6">
            <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Delete Selected Trades?</h2>
            <p className="mb-6 text-stone-600 dark:text-stone-300">
              This will permanently delete {selectedTradeIds.size} selected trade{selectedTradeIds.size === 1 ? '' : 's'}. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowBulkDeleteConfirm(false)} className="app-secondary-btn">Cancel</button>
              <button onClick={handleBulkDelete} className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <ImportDialog />
    </div>
  );
}
