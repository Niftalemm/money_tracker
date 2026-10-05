'use client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money } from '@/lib/accounting';
import type { DailyPoint } from '@/lib/insights';
const INK = '#5b6d65',
  GRID = '#e6ece8',
  GREEN = '#1f7a55',
  GREEN_SOFT = '#cfe8db',
  PRIOR = '#9aaba3',
  INCOME = '#2a9d8f';
// Keep a readable scale when a month has no spending yet (values are cents).
const DOMAIN: [(min: number) => number, (max: number) => number] = [
  (min) => Math.min(0, min),
  (max) => Math.max(max, 10000),
];
const compact = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
type TipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{
    name?: string | number;
    value?: unknown;
    color?: string;
    dataKey?: unknown;
  }>;
};
function Tip({
  active,
  payload,
  label,
  title,
  names,
}: TipProps & {
  title: (label: string | number) => string;
  names: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <p className="chart-tip-title">{title(label ?? '')}</p>
      {payload
        .filter((p) => typeof p.value === 'number')
        .map((p) => (
          <p key={String(p.dataKey)}>
            <i style={{ background: p.color }} />
            {names[String(p.dataKey)] ?? p.name}
            <strong>{money(p.value as number)}</strong>
          </p>
        ))}
    </div>
  );
}
const axis = {
  axisLine: false,
  tickLine: false,
  tick: { fill: INK, fontSize: 12 },
} as const;
export function SpendingChart({
  points,
  currentLabel,
  priorLabel,
  monthName,
}: {
  points: DailyPoint[];
  currentLabel: string;
  priorLabel: string | null;
  monthName: string;
}) {
  const last = points.length;
  return (
    <div className="chart" aria-hidden>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart
          accessibilityLayer={false}
          data={points}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={GREEN} stopOpacity={0.22} />
              <stop offset="1" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="day"
            {...axis}
            ticks={[1, 8, 15, 22, last]}
            interval={0}
          />
          <YAxis
            {...axis}
            width={52}
            tickFormatter={(v: number) => compact(v)}
            domain={DOMAIN}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: GRID, strokeWidth: 2 }}
            content={(p) => (
              <Tip
                {...(p as TipProps)}
                title={(d) => `${monthName} ${d}`}
                names={{
                  current: currentLabel,
                  previous: priorLabel ?? 'Prior month',
                }}
              />
            )}
          />
          {priorLabel && (
            <Line
              type="monotone"
              dataKey="previous"
              stroke={PRIOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="current"
            stroke={GREEN}
            strokeWidth={2.5}
            fill="url(#spend-fill)"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function MonthlyChart({
  data,
}: {
  data: { label: string; actual: number; estimate?: number }[];
}) {
  return (
    <div className="chart" aria-hidden>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          accessibilityLayer={false}
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barGap={4}
        >
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axis} />
          <YAxis
            {...axis}
            width={52}
            tickFormatter={(v: number) => compact(v)}
            domain={DOMAIN}
          />
          <Tooltip
            cursor={{ fill: '#f1f6f3' }}
            content={(p) => (
              <Tip
                {...(p as TipProps)}
                title={(l) => String(l)}
                names={{ actual: 'Actual', estimate: 'Estimate' }}
              />
            )}
          />
          <Bar
            dataKey="actual"
            fill={GREEN}
            radius={[6, 6, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
          />
          <Bar
            dataKey="estimate"
            fill={GREEN_SOFT}
            stroke="#6fa58b"
            strokeDasharray="4 3"
            radius={[6, 6, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function CashFlowChart({
  data,
}: {
  data: { label: string; income: number; spending: number }[];
}) {
  return (
    <div className="chart" aria-hidden>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          accessibilityLayer={false}
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barGap={4}
        >
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axis} />
          <YAxis
            {...axis}
            width={52}
            tickFormatter={(v: number) => compact(v)}
            domain={DOMAIN}
          />
          <Tooltip
            cursor={{ fill: '#f1f6f3' }}
            content={(p) => (
              <Tip
                {...(p as TipProps)}
                title={(l) => String(l)}
                names={{ income: 'Recorded income', spending: 'Net spending' }}
              />
            )}
          />
          <Bar
            dataKey="income"
            fill={INCOME}
            radius={[6, 6, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          />
          <Bar
            dataKey="spending"
            fill={GREEN}
            radius={[6, 6, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
