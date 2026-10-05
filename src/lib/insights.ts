// Derived, read-only views for the dashboard and reports. Nothing here is stored.
import {
  ACCOUNTS,
  START,
  type Account,
  type TrackerState,
  type Transaction,
} from './model';
import {
  accountCoverage,
  billDue,
  billPayment,
  groups,
  monthDays,
  monthTransactions,
  net,
  previousMonth,
  todayNY,
  total,
} from './accounting';
export type DailyPoint = { day: number; current?: number; previous?: number };
// Running net spending by posted day for a month and, when tracked, the month before it.
export function cumulativeSeries(
  s: TrackerState,
  month: string,
  today = todayNY(),
): { points: DailyPoint[]; prior: string | null } {
  const days = monthDays(month),
    end = month === today.slice(0, 7) ? +today.slice(8) : days,
    prior = previousMonth(month),
    hasPrior = prior >= START.slice(0, 7),
    priorDays = monthDays(prior);
  const byDay = (list: Transaction[]) => {
    const sums = new Map<number, number>();
    for (const t of list) {
      const day = +t.postedDate.slice(8);
      sums.set(day, (sums.get(day) ?? 0) + net(t));
    }
    return sums;
  };
  const current = byDay(monthTransactions(s, month)),
    previous = hasPrior ? byDay(monthTransactions(s, prior)) : new Map();
  const points: DailyPoint[] = [];
  let runningCurrent = 0,
    runningPrevious = 0;
  for (let day = 1; day <= days; day++) {
    runningCurrent += current.get(day) ?? 0;
    runningPrevious += previous.get(day) ?? 0;
    points.push({
      day,
      current: day <= end ? runningCurrent : undefined,
      previous: hasPrior && day <= priorDays ? runningPrevious : undefined,
    });
  }
  return { points, prior: hasPrior ? prior : null };
}
// Income excludes matched shared reimbursements, which already reduce their purchase.
export function cashFlow(s: TrackerState, month: string) {
  const tx = monthTransactions(s, month);
  const income = tx
    .filter((t) => t.type === 'income' && !t.reimbursementFor)
    .reduce((sum, t) => sum + t.amountCents, 0);
  const spending = total(tx);
  return {
    income,
    spending,
    net: income - spending,
    transfers: tx.filter((t) => t.type === 'transfer').length,
  };
}
export function categoryShares(transactions: Transaction[]) {
  const list = groups(transactions, 'category');
  const positive = list.reduce((sum, g) => sum + Math.max(0, g.cents), 0);
  return list.map((g) => ({
    ...g,
    share: positive > 0 ? Math.max(0, g.cents) / positive : 0,
  }));
}
// A missing import is not a missed payment: unmatched bills stay "none" unless confirmed unpaid.
export type BillStatus = 'linked' | 'changed' | 'unpaid' | 'none';
export function billsForMonth(
  s: TrackerState,
  month: string,
  today = todayNY(),
) {
  const bills = s.bills
    .map((bill) => {
      const payment = billPayment(s, bill.id, month),
        due = billDue(month, bill.dueDay);
      const status: BillStatus = payment
        ? payment.amountCents === bill.amountCents
          ? 'linked'
          : 'changed'
        : bill.confirmedUnpaidMonths.includes(month)
          ? 'unpaid'
          : 'none';
      return { bill, due, payment, status, upcoming: due >= today };
    })
    .sort((a, b) => a.due.localeCompare(b.due));
  const paid = (b: (typeof bills)[number]) =>
    b.status === 'linked' || b.status === 'changed';
  return {
    bills,
    scheduled: s.bills.reduce((sum, b) => sum + b.amountCents, 0),
    linked: bills.filter(paid).length,
    remaining: bills
      .filter((b) => !paid(b))
      .reduce((sum, b) => sum + b.bill.amountCents, 0),
  };
}
export function billLabel(status: BillStatus, upcoming: boolean) {
  return {
    linked: ['Payment linked', 'good'],
    changed: ['Paid · amount changed', 'warn'],
    unpaid: ['Confirmed unpaid', 'bad'],
    none: ['No payment recorded', upcoming ? 'info' : 'warn'],
  }[status] as [string, 'good' | 'warn' | 'bad' | 'info'];
}
export function accountActivity(s: TrackerState, account: Account) {
  const lastImport = s.batches
    .filter((b) => b.account === account)
    .map((b) => b.importedAt)
    .sort()
    .at(-1);
  const coveredThrough = s.coverage
    .filter((c) => c.account === account)
    .map((c) => c.through)
    .sort()
    .at(-1);
  return { lastImport, coveredThrough };
}
// Setup progress for a new vault, derived from records only.
export function setupProgress(s: TrackerState) {
  const imported = ACCOUNTS.filter((a) =>
    s.batches.some((b) => b.account === a),
  ).length;
  const september = ACCOUNTS.filter(
    (a) => accountCoverage(s, a, START.slice(0, 7)).complete,
  ).length;
  return { imported, september, bills: s.bills.length, total: ACCOUNTS.length };
}
export function dayGroups(transactions: Transaction[]) {
  const map = new Map<string, Transaction[]>();
  for (const t of [...transactions].sort((a, b) =>
    b.postedDate.localeCompare(a.postedDate),
  ))
    map.set(t.postedDate, [...(map.get(t.postedDate) ?? []), t]);
  return [...map].map(([date, list]) => ({
    date,
    transactions: list,
    net: total(list),
  }));
}
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
export const monthShort = (month: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(month + '-01T12:00:00Z'));
