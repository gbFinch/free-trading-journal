import clsx from 'clsx';
import type { PeriodMetrics } from '@/types';

interface DashboardMetricsProps {
  metrics: PeriodMetrics;
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absValue >= 1000) {
    return `${sign}$${absValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${sign}$${absValue.toFixed(2)}`;
}

// Icon: Dollar sign for P&L
function DollarIcon() {
  return (
    <svg className="w-4 h-4 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// Icon: Chart/scale for profit factor
function ScaleIcon() {
  return (
    <svg className="w-4 h-4 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  );
}

// Icon: Percentage/target for win rate
function TargetIcon() {
  return (
    <svg className="w-4 h-4 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

// Icon: Trending up/down for avg win/loss
function TrendIcon() {
  return (
    <svg className="w-4 h-4 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

// Icon: Calculator for expectancy
function CalculatorIcon() {
  return (
    <svg className="w-4 h-4 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function DonutChart({ winPercent, lossPercent }: { winPercent: number; lossPercent: number }) {
  const size = 44;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const winDash = (winPercent / 100) * circumference;
  const lossDash = (lossPercent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ef4444" strokeWidth={strokeWidth}
        strokeDasharray={`${lossDash} ${circumference}`} strokeDashoffset={0} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#22c55e" strokeWidth={strokeWidth}
        strokeDasharray={`${winDash} ${circumference}`} strokeDashoffset={-lossDash} />
    </svg>
  );
}

function GaugeChart({ percent }: { percent: number }) {
  const circumference = Math.PI * 30;
  const fillAmount = (percent / 100) * circumference;

  return (
    <svg width={70} height={38} viewBox="0 0 70 38">
      <path d="M 5 35 A 30 30 0 0 1 65 35" fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={5} strokeLinecap="round" />
      <path d="M 5 35 A 30 30 0 0 1 65 35" fill="none" stroke="#22c55e" strokeWidth={5} strokeLinecap="round"
        strokeDasharray={`${fillAmount} ${circumference}`} />
    </svg>
  );
}

function WinLossBar({ avgWin, avgLoss }: { avgWin: number; avgLoss: number }) {
  const total = avgWin + Math.abs(avgLoss);
  const winPercent = total > 0 ? (avgWin / total) * 100 : 50;

  return (
    <div className="flex flex-col gap-0.5 w-full">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
        <div className="bg-green-500 h-full" style={{ width: `${winPercent}%` }} />
        <div className="bg-red-500 h-full" style={{ width: `${100 - winPercent}%` }} />
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-green-600 dark:text-green-400">${avgWin.toFixed(0)}</span>
        <span className="text-red-600 dark:text-red-400">-${Math.abs(avgLoss).toFixed(0)}</span>
      </div>
    </div>
  );
}

export default function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  const winRate = metrics.win_rate !== null ? metrics.win_rate * 100 : 0;
  const totalTrades = metrics.win_count + metrics.loss_count + metrics.breakeven_count;
  const winPercent = totalTrades > 0 ? (metrics.win_count / totalTrades) * 100 : 0;
  const lossPercent = totalTrades > 0 ? (metrics.loss_count / totalTrades) * 100 : 0;

  const avgWinLossRatio = metrics.avg_win !== null && metrics.avg_loss !== null && metrics.avg_loss !== 0
    ? Math.abs(metrics.avg_win / metrics.avg_loss)
    : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {/* Net P&L Card */}
      <div className="app-panel px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Net P&L</span>
          <DollarIcon />
          <span className="ml-auto text-xs text-stone-400 dark:text-stone-500">{metrics.trade_count}</span>
        </div>
        <div className="h-11 flex items-center">
          <span className={clsx(
            'text-xl font-bold',
            metrics.total_net_pnl > 0 ? 'text-green-600 dark:text-green-400' : metrics.total_net_pnl < 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-300'
          )}>
            {formatCurrency(metrics.total_net_pnl)}
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Across all recorded trades</p>
      </div>

      {/* Profit Factor Card */}
      <div className="app-panel px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Profit factor</span>
          <ScaleIcon />
        </div>
        <div className="h-11 flex items-center justify-between">
          <span className="text-xl font-bold text-stone-900 dark:text-stone-100">
            {metrics.profit_factor !== null && isFinite(metrics.profit_factor)
              ? metrics.profit_factor.toFixed(2)
              : 'N/A'}
          </span>
          <DonutChart winPercent={winPercent} lossPercent={lossPercent} />
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Gross profit divided by gross loss</p>
      </div>

      {/* Trade Win % Card */}
      <div className="app-panel px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Trade win %</span>
          <TargetIcon />
        </div>
        <div className="h-11 flex items-center justify-between">
          <span className="text-xl font-bold text-stone-900 dark:text-stone-100">
            {winRate.toFixed(2)}%
          </span>
          <div className="flex flex-col items-center">
            <GaugeChart percent={winRate} />
            <div className="flex items-center gap-2 text-[10px] -mt-1">
              <span className="text-red-600 dark:text-red-400">{metrics.loss_count}</span>
              <span className="text-stone-400 dark:text-stone-500">{metrics.breakeven_count}</span>
              <span className="text-green-600 dark:text-green-400">{metrics.win_count}</span>
            </div>
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Win consistency by closed outcomes</p>
      </div>

      {/* Avg Win/Loss Trade Card */}
      <div className="app-panel px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Avg win/loss trade</span>
          <TrendIcon />
        </div>
        <div className="h-11 flex items-center gap-3">
          <span className="text-xl font-bold text-stone-900 dark:text-stone-100">
            {avgWinLossRatio !== null ? avgWinLossRatio.toFixed(2) : 'N/A'}
          </span>
          <div className="flex-1">
            {metrics.avg_win !== null && metrics.avg_loss !== null && (
              <WinLossBar avgWin={metrics.avg_win} avgLoss={metrics.avg_loss} />
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Average gain to average loss ratio</p>
      </div>

      {/* Trade Expectancy Card */}
      <div className="app-panel px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Trade expectancy</span>
          <CalculatorIcon />
        </div>
        <div className="h-11 flex items-center">
          <span className={clsx(
            'text-xl font-bold',
            metrics.expectancy !== null && metrics.expectancy > 0
              ? 'text-green-600 dark:text-green-400'
              : metrics.expectancy !== null && metrics.expectancy < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-stone-600 dark:text-stone-300'
          )}>
            {metrics.expectancy !== null ? formatCurrency(metrics.expectancy) : 'N/A'}
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Expected value per trade</p>
      </div>
    </div>
  );
}
