import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useTradesStore } from '@/stores';
import { getTradeExecutions } from '@/api/import';
import TradeForm from '@/components/TradeForm';
import clsx from 'clsx';
import type { Execution } from '@/types';

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
  value: string;
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
              <td className="px-3 py-2.5">{format(new Date(exec.execution_date), 'MMM d, yyyy')}</td>
              <td className="px-3 py-2.5">{exec.execution_time || '-'}</td>
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
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
            <DetailRow label="R-Multiple" value={formatNumber(trade.r_multiple)} valueClass={pnlClass(trade.r_multiple)} />
          </div>
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
