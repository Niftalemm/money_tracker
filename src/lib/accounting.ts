import {
  ACCOUNTS,
  START,
  type Account,
  type TrackerState,
  type Transaction,
} from './model';
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100,
  );
export const todayNY = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const monthDays = (month: string) =>
  new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
export function previousMonth(month: string) {
  const d = new Date(month + '-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
export function nextMonth(month: string) {
  const d = new Date(month + '-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10);
/** The earliest month with records or confirmed coverage (September 2026 at the latest). */
export function firstMonth(s?: {
  transactions: { postedDate: string }[];
  coverage: { from: string }[];
}) {
  let first = START.slice(0, 7);
  for (const t of s?.transactions ?? [])
    if (t.postedDate.slice(0, 7) < first) first = t.postedDate.slice(0, 7);
  for (const c of s?.coverage ?? [])
    if (c.from.slice(0, 7) < first) first = c.from.slice(0, 7);
  return first;
}
export function trackedMonths(
  through = todayNY().slice(0, 7),
  from = START.slice(0, 7),
) {
  const result: string[] = [];
  for (let m = from; m <= through; m = nextMonth(m)) result.push(m);
  return result;
}
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(month + '-01T12:00:00Z'));
export function net(t: Transaction) {
  return t.type === 'purchase'
    ? t.amountCents - t.reimbursementCents
    : t.type === 'refund' && !t.reimbursementFor
      ? -t.amountCents
      : 0;
}
export function monthTransactions(
  s: TrackerState,
  month: string,
  through = monthDays(month),
) {
  return s.transactions.filter(
    (t) =>
      t.postedDate.slice(0, 7) === month && +t.postedDate.slice(8) <= through,
  );
}
export function total(transactions: Transaction[]) {
  return transactions.reduce((sum, t) => sum + net(t), 0);
}
export function change(current: number, prior: number) {
  return {
    dollars: current - prior,
    percent: prior > 0 ? ((current - prior) / prior) * 100 : null,
  };
}
export function groups(
  transactions: Transaction[],
  key: 'category' | 'merchant',
) {
  const map = new Map<string, number>();
  transactions.forEach((t) => {
    if (t.type === 'purchase' || (t.type === 'refund' && !t.reimbursementFor))
      map.set(t[key], (map.get(t[key]) ?? 0) + net(t));
  });
  return [...map]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents);
}
export function accountCoverage(
  s: TrackerState,
  account: Account,
  month: string,
  today = todayNY(),
) {
  const endDay =
    month === today.slice(0, 7) ? +today.slice(8) : monthDays(month);
  const gaps: string[] = [];
  let contiguous = 0,
    covered = 0;
  for (let day = 1; day <= endDay; day++) {
    const date = month + '-' + String(day).padStart(2, '0');
    const exists = s.coverage.some(
      (c) => c.account === account && c.from <= date && c.through >= date,
    );
    if (exists) {
      covered++;
      if (contiguous === day - 1) contiguous = day;
    } else gaps.push(date);
  }
  const ranges = s.coverage.filter(
    (c) =>
      c.account === account &&
      c.through >= month + '-01' &&
      c.from <= month + '-' + String(endDay).padStart(2, '0'),
  );
  return {
    covered,
    contiguous,
    endDay,
    complete: covered === endDay,
    gaps,
    ranges,
  };
}
export function comparison(s: TrackerState, month: string, today = todayNY()) {
  const currentMonth = month === today.slice(0, 7);
  const cover = ACCOUNTS.map((a) => accountCoverage(s, a, month, today));
  const incomplete = cover.some((c) => !c.complete);
  const days =
    currentMonth || incomplete
      ? Math.min(...cover.map((c) => c.contiguous))
      : monthDays(month);
  const prior = previousMonth(month);
  const available = prior >= firstMonth(s) && days > 0;
  const previousDays = Math.min(days, monthDays(prior));
  const priorCovered =
    available &&
    ACCOUNTS.every(
      (a) => accountCoverage(s, a, prior, today).contiguous >= previousDays,
    );
  const current = available ? total(monthTransactions(s, month, days)) : 0;
  const previous = available
    ? total(monthTransactions(s, prior, previousDays))
    : 0;
  return {
    available,
    current,
    previous,
    days,
    prior,
    partial: incomplete || !priorCovered || currentMonth,
    ...change(current, previous),
    currentTransactions: monthTransactions(s, month, days),
    previousTransactions: monthTransactions(s, prior, previousDays),
  };
}
export function billPayment(s: TrackerState, billId: string, month: string) {
  return monthTransactions(s, month).find(
    (t) => t.billId === billId && t.type === 'purchase',
  );
}
export function billDue(month: string, dueDay: number) {
  return (
    month + '-' + String(Math.min(dueDay, monthDays(month))).padStart(2, '0')
  );
}
export function estimate(s: TrackerState, month: string, today = todayNY()) {
  if (month !== today.slice(0, 7)) return null;
  const covers = ACCOUNTS.map((a) => accountCoverage(s, a, month, today));
  const days = Math.min(...covers.map((c) => c.contiguous));
  const aligned =
    days > 0 &&
    covers.every((c) => c.contiguous === days && c.covered === c.contiguous);
  const age = +today.slice(8) - days;
  const remainingBills = s.bills
    .filter((b) => !billPayment(s, b.id, month))
    .reduce((sum, b) => sum + b.amountCents, 0);
  const plannedBills = s.bills.reduce((sum, b) => sum + b.amountCents, 0);
  if (aligned && age <= 7) {
    const covered = monthTransactions(s, month, days);
    const variable = total(covered.filter((t) => !t.billId && !t.oneTime));
    return {
      cents:
        total(monthTransactions(s, month)) +
        remainingBills +
        Math.round((variable / days) * (monthDays(month) - days)),
      label: days < 7 ? 'Early estimate' : 'Projected month-end',
      detail: `Based on ${days} aligned covered days. Includes ${money(remainingBills)} in scheduled bills without a linked payment; assumes they will occur. Excludes linked bills and one-time costs from the daily rate.`,
    };
  }
  const prior = trackedMonths(previousMonth(month), firstMonth(s))
    .reverse()
    .find((m) =>
      ACCOUNTS.every((a) => accountCoverage(s, a, m, today).complete),
    );
  if (!prior) return null;
  const variable = total(
    monthTransactions(s, prior).filter((t) => !t.billId && !t.oneTime),
  );
  return {
    cents:
      Math.round((variable / monthDays(prior)) * monthDays(month)) +
      plannedBills,
    label: 'Historical planning estimate',
    detail: `Uses ${monthLabel(prior)} variable daily spending and ${money(plannedBills)} in this month's scheduled bills. Assumes the same daily rate; excludes one-time costs. Current coverage is missing, uneven, or over seven days old.`,
  };
}
export function updateNotice(
  s: TrackerState,
  account: Account,
  today = todayNY(),
) {
  const month = today.slice(0, 7),
    day = +today.slice(8),
    availability = s.preferences.statementDays[account];
  const latest = s.coverage
    .filter((c) => c.account === account)
    .map((c) => c.through)
    .sort()
    .at(-1);
  const dated = s.coverage
    .filter((c) => c.account === account)
    .map((c) => ({
      through: c.through,
      received:
        c.confirmedAt ?? s.batches.find((b) => b.id === c.batchId)?.importedAt,
    }));
  const before = dated
    .filter(
      (c) => !c.received || todayNY(new Date(c.received)).slice(0, 7) < month,
    )
    .map((c) => c.through)
    .sort()
    .at(-1);
  const advanced = dated.some(
    (c) =>
      c.received &&
      todayNY(new Date(c.received)).slice(0, 7) === month &&
      c.through > (before ?? '') &&
      c.through >= previousMonth(month) + '-01' &&
      c.through === latest,
  );
  if (
    availability !== null &&
    day >= Math.min(availability, monthDays(month)) &&
    !advanced
  )
    return 'Statement update due';
  if (
    account === 'Amex' &&
    s.preferences.weeklyAmex &&
    (!latest || Date.parse(today) - Date.parse(latest) > 7 * 86400000)
  )
    return 'Weekly update due';
  return null;
}
