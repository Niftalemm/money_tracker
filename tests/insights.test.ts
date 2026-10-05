import { describe, expect, it } from 'vitest';
import { demoState } from '../src/lib/demo';
import { emptyState } from '../src/lib/model';
import { monthTransactions, total } from '../src/lib/accounting';
import {
  accountActivity,
  billLabel,
  billsForMonth,
  cashFlow,
  categoryShares,
  cumulativeSeries,
  dayGroups,
  setupProgress,
} from '../src/lib/insights';
const today = '2026-10-04';
describe('dashboard insights derived from synthetic records', () => {
  it('builds a running September total with no untracked prior month', () => {
    const s = demoState();
    const { points, prior } = cumulativeSeries(s, '2026-09', today);
    expect(prior).toBeNull();
    expect(points).toHaveLength(30);
    expect(points.at(-1)!.current).toBe(total(monthTransactions(s, '2026-09')));
    expect(points.every((p) => p.previous === undefined)).toBe(true);
  });
  it('stops the current month at today and compares against September', () => {
    const s = demoState();
    const { points, prior } = cumulativeSeries(s, '2026-10', today);
    expect(prior).toBe('2026-09');
    expect(points).toHaveLength(31);
    expect(points[2].current).toBe(160000 + 9250 + 2800);
    expect(points[3].current).toBe(points[2].current);
    expect(points[4].current).toBeUndefined();
    expect(points[29].previous).toBe(total(monthTransactions(s, '2026-09')));
    expect(points[30].previous).toBeUndefined();
  });
  it('counts income without matched reimbursements and keeps transfers out', () => {
    const flow = cashFlow(demoState(), '2026-09');
    expect(flow.income).toBe(420000);
    expect(flow.spending).toBe(234569);
    expect(flow.net).toBe(420000 - 234569);
    expect(flow.transfers).toBe(1);
  });
  it('labels bills without treating a missing import as a missed payment', () => {
    const s = demoState();
    const october = billsForMonth(s, '2026-10', today);
    expect(october.bills.map((b) => [b.bill.id, b.status])).toEqual([
      ['rent', 'linked'],
      ['internet', 'none'],
    ]);
    expect(october.bills[1].upcoming).toBe(true);
    expect(billLabel('none', true)).toEqual(['No payment recorded', 'info']);
    expect(october.remaining).toBe(6500);
    s.transactions.find((t) => t.billId === 'internet')!.amountCents = 7000;
    s.bills[1].confirmedUnpaidMonths = ['2026-10'];
    expect(billsForMonth(s, '2026-09', today).bills[1].status).toBe('changed');
    expect(billsForMonth(s, '2026-10', today).bills[1].status).toBe('unpaid');
  });
  it('groups days newest first with their net spending', () => {
    const groups = dayGroups(monthTransactions(demoState(), '2026-09'));
    expect(groups[0].date).toBe('2026-09-30');
    expect(groups[0].net).toBe(7350);
    const dates = groups.map((g) => g.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
  it('shares categories of positive spending only', () => {
    const shares = categoryShares(monthTransactions(demoState(), '2026-09'));
    expect(shares[0].name).toBe('Housing');
    expect(shares.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1, 10);
  });
  it('tracks setup progress and account activity from records alone', () => {
    expect(setupProgress(emptyState())).toEqual({
      imported: 0,
      september: 0,
      bills: 0,
      total: 3,
    });
    const s = demoState();
    expect(setupProgress(s)).toEqual({
      imported: 1,
      september: 3,
      bills: 2,
      total: 3,
    });
    expect(accountActivity(s, 'Amex')).toEqual({
      lastImport: '2026-10-04T16:00:00Z',
      coveredThrough: '2026-10-03',
    });
    expect(accountActivity(s, 'Capital One').lastImport).toBeUndefined();
  });
});
