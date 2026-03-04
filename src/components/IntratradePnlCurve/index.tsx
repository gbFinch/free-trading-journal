import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useThemeStore } from '@/stores';

interface IntratradePnlPoint {
  time: number;
  pnl: number;
  remainingSize: number;
}

interface IntratradePnlCurveProps {
  data: IntratradePnlPoint[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNyTimeLabel(timestampMs: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestampMs));
}

interface TooltipDataPoint {
  timestamp: number;
  pnl: number;
  remainingSize: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TooltipDataPoint }>;
  label?: number;
  isDark: boolean;
}

function CustomTooltip({ active, payload, label, isDark }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  if (!row) return null;

  return (
    <div
      style={{
        backgroundColor: isDark ? '#111827' : 'white',
        border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
        borderRadius: '8px',
        color: isDark ? '#f3f4f6' : '#111827',
        padding: '8px 10px',
      }}
    >
      <div style={{ fontSize: 12, marginBottom: 4 }}>{formatNyTimeLabel(label ?? row.timestamp)}</div>
      <div style={{ fontSize: 12, fontWeight: 600 }}>P&amp;L: {formatCurrency(row.pnl)}</div>
      <div style={{ fontSize: 12 }}>Remaining size: {row.remainingSize}</div>
    </div>
  );
}

export default function IntratradePnlCurve({ data }: IntratradePnlCurveProps) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const chartData = useMemo(() => data.map((point) => ({
    timestamp: point.time * 1000,
    pnl: point.pnl,
    remainingSize: point.remainingSize,
    positivePnl: point.pnl >= 0 ? point.pnl : 0,
    negativePnl: point.pnl < 0 ? point.pnl : 0,
  })), [data]);

  const lineColor = chartData.length > 0 && chartData[chartData.length - 1].pnl >= 0
    ? '#22c55e'
    : '#ef4444';

  const ticks = useMemo(() => {
    if (chartData.length < 2) return chartData.map((d) => d.timestamp);
    const minTime = chartData[0].timestamp;
    const maxTime = chartData[chartData.length - 1].timestamp;
    const tickCount = 5;
    const step = (maxTime - minTime) / (tickCount - 1);
    return Array.from({ length: tickCount }, (_, i) => minTime + step * i);
  }, [chartData]);

  if (chartData.length < 2) {
    return (
      <div className="flex h-[170px] items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
        Not enough candles to draw P&amp;L path
      </div>
    );
  }

  return (
    <div className="h-[170px] w-full rounded-xl border border-stone-200 bg-white/70 p-2 dark:border-stone-700 dark:bg-stone-900/40">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 14, left: 14, bottom: 8 }}>
          <defs>
            <linearGradient id="intratradePnlGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#22c55e" stopOpacity={0.75} />
              <stop offset={1} stopColor="#16a34a" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="intratradePnlRed" x1="0" y1="1" x2="0" y2="0">
              <stop offset={0} stopColor="#ef4444" stopOpacity={0.75} />
              <stop offset={1} stopColor="#dc2626" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid
            horizontal={true}
            vertical={false}
            strokeDasharray="3 3"
            stroke={isDark ? '#374151' : '#e5e7eb'}
            strokeOpacity={0.55}
          />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={ticks}
            tickFormatter={formatNyTimeLabel}
            stroke={isDark ? '#9ca3af' : '#6b7280'}
            fontSize={11}
          />
          <YAxis
            tickFormatter={formatCurrency}
            stroke={isDark ? '#9ca3af' : '#6b7280'}
            fontSize={11}
            width={58}
          />
          <Tooltip
            content={<CustomTooltip isDark={isDark} />}
          />
          <ReferenceLine y={0} stroke={isDark ? '#4b5563' : '#d1d5db'} strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="positivePnl"
            stroke="none"
            fill="url(#intratradePnlGreen)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="negativePnl"
            stroke="none"
            fill="url(#intratradePnlRed)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="pnl"
            stroke={lineColor}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 4.5, fill: lineColor }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
