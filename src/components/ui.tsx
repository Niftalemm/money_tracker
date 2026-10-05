'use client';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  HeartPulse,
  House,
  Info,
  LoaderCircle,
  Repeat,
  Shapes,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TramFront,
  TriangleAlert,
  UtensilsCrossed,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { change, money } from '@/lib/accounting';
import type { Account } from '@/lib/model';
import BankLogo from './BankLogo';
const CATEGORY_META: Record<string, [LucideIcon, string]> = {
  Groceries: [ShoppingCart, 'c-green'],
  Dining: [UtensilsCrossed, 'c-clay'],
  Transit: [TramFront, 'c-sky'],
  Housing: [House, 'c-forest'],
  Utilities: [Zap, 'c-ochre'],
  Subscriptions: [Repeat, 'c-plum'],
  Shopping: [ShoppingBag, 'c-rose'],
  Health: [HeartPulse, 'c-teal'],
  Other: [Shapes, 'c-slate'],
  Uncategorized: [CircleHelp, 'c-amber'],
};
const CUSTOM = ['c-moss', 'c-teal', 'c-sky', 'c-plum', 'c-clay', 'c-green'];
export function categoryTone(name: string) {
  if (CATEGORY_META[name]) return CATEGORY_META[name][1];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CUSTOM[hash % CUSTOM.length];
}
export function CategoryIcon({
  name,
  size = 'md',
  bare = false,
}: {
  name: string;
  size?: 'sm' | 'md';
  bare?: boolean;
}) {
  const Icon = CATEGORY_META[name]?.[0] ?? Tag;
  if (bare) return <Icon size={18} strokeWidth={1.75} aria-hidden />;
  return (
    <span className={`cat-icon ${size} ${categoryTone(name)}`} aria-hidden>
      <Icon size={size === 'sm' ? 13 : 16} strokeWidth={2} />
    </span>
  );
}
const BADGE_SIZE = { xs: 14, sm: 20, md: 32, lg: 40 } as const;
export function AccountBadge({
  account,
  size = 'md',
}: {
  account: Account;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`acct-badge ${size}`} aria-hidden>
      <BankLogo account={account} size={BADGE_SIZE[size]} />
    </span>
  );
}
// Spending going up is flagged warm; going down is calm green. Never color-only.
export function Delta({
  current,
  previous,
  compact = false,
}: {
  current: number;
  previous: number;
  compact?: boolean;
}) {
  const d = change(current, previous);
  const Icon = d.dollars > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={
        d.dollars > 0 ? 'delta up' : d.dollars < 0 ? 'delta down' : 'delta'
      }
    >
      {d.dollars !== 0 && <Icon size={13} aria-hidden />}
      {d.dollars > 0 ? '+' : ''}
      {money(d.dollars)}
      {!compact && d.percent !== null && (
        <span className="delta-pct">
          {d.percent > 0 ? '+' : ''}
          {d.percent.toFixed(1)}%
        </span>
      )}
    </span>
  );
}
export function Spinner({ label }: { label?: string }) {
  return (
    <LoaderCircle
      className="spinner"
      size={16}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info';
  children: React.ReactNode;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function Progress({
  value,
  tone = '',
  label,
}: {
  value: number;
  tone?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span
      className="progress"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className={`progress-fill ${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}
export function Notice({
  tone = 'info',
  children,
  onDismiss,
  role,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  children: React.ReactNode;
  onDismiss?: () => void;
  role?: 'alert' | 'status';
}) {
  const Icon =
    tone === 'error'
      ? CircleAlert
      : tone === 'warn'
        ? TriangleAlert
        : tone === 'success'
          ? CircleCheck
          : Info;
  return (
    <div className={`notice ${tone}`} role={role}>
      <Icon size={17} className="notice-icon" aria-hidden />
      <div className="notice-body">{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="icon-button notice-close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden>
        <Icon size={22} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}
export function CardHeader({
  title,
  subtitle,
  action,
  as: Heading = 'h2',
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="card-header">
      <div>
        <Heading className="card-title">{title}</Heading>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
