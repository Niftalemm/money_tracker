import { describe, expect, it } from 'vitest';
import {
  accountCoverage,
  billDue,
  change,
  comparison,
  estimate,
  net,
  todayNY,
  total,
  updateNotice,
} from '../src/lib/accounting';
import { ACCOUNTS, emptyState, type Transaction } from '../src/lib/model';
const transaction = (extra: Partial<Transaction> = {}): Transaction => ({
  id: crypto.randomUUID(),
  postedDate: '2026-09-10',
  merchant: 'Synthetic shop',
  account: 'Amex',
  category: 'Shopping',
  type: 'purchase',
  amountCents: 5000,
  reimbursementCents: 0,
  notes: '',
  source: 'manual',
  batchIds: [],
  oneTime: false,
  ...extra,
});
describe('accounting boundaries', () => {
  it('counts a purchase plus card payment once; fees count and income does not', () =>
    expect(
      total([
        transaction(),
        transaction({ type: 'transfer' }),
        transaction({ type: 'income' }),
        transaction({ merchant: 'Interest', amountCents: 123 }),
      ]),
    ).toBe(5123));
  it('subtracts refunds, and never subtracts a linked reimbursement twice', () =>
    expect(
      total([
        transaction({ reimbursementCents: 2000 }),
        transaction({ type: 'refund', amountCents: 1000 }),
        transaction({
          type: 'refund',
          amountCents: 2000,
          reimbursementFor: 'purchase',
        }),
      ]),
    ).toBe(2000));
  it('omits percentages with zero or negative baselines', () => {
    expect(change(150, 0)).toEqual({ dollars: 150, percent: null });
    expect(change(150, -50).percent).toBeNull();
    expect(change(150, 100).percent).toBe(50);
  });
  it('a purchase date or statement cycle does not establish coverage', () => {
    const s = emptyState();
    s.transactions = [transaction()];
    expect(accountCoverage(s, 'Amex', '2026-09', '2026-10-04').covered).toBe(0);
    s.coverage.push({
      id: 'a',
      account: 'Amex',
      from: '2026-09-01',
      through: '2026-09-23',
    });
    expect(accountCoverage(s, 'Amex', '2026-09', '2026-10-04').complete).toBe(
      false,
    );
  });
  it('compares equally covered days of incomplete months', () => {
    const s = emptyState();
    for (const a of ACCOUNTS) {
      s.coverage.push(
        { id: a, account: a, from: '2026-09-01', through: '2026-09-30' },
        { id: a + '2', account: a, from: '2026-10-01', through: '2026-10-03' },
      );
    }
    s.transactions = [
      transaction({ postedDate: '2026-09-02', amountCents: 1000 }),
      transaction({ postedDate: '2026-09-15', amountCents: 9000 }),
      transaction({ postedDate: '2026-10-02', amountCents: 1500 }),
    ];
    const c = comparison(s, '2026-10', '2026-10-04');
    expect(c.days).toBe(3);
    expect(c.dollars).toBe(500);
    expect(c.percent).toBe(50);
    expect(c.partial).toBe(true);
  });
  it('refunds apply to the month they post, regardless of purchase date', () => {
    const s = emptyState();
    s.transactions = [
      transaction({
        type: 'refund',
        postedDate: '2026-10-02',
        purchaseDate: '2026-09-05',
      }),
    ];
    expect(net(s.transactions[0])).toBe(-5000);
  });
  it('projects with aligned fresh coverage excluding bills and one-time purchases', () => {
    const s = emptyState();
    ACCOUNTS.forEach((a) =>
      s.coverage.push({
        id: a,
        account: a,
        from: '2026-10-01',
        through: '2026-10-03',
      }),
    );
    s.bills.push(
      {
        id: 'rent',
        name: 'Rent',
        amountCents: 90000,
        category: 'Housing',
        dueDay: 1,
        confirmedUnpaidMonths: [],
      },
      {
        id: 'internet',
        name: 'Internet',
        amountCents: 6000,
        category: 'Utilities',
        dueDay: 15,
        confirmedUnpaidMonths: [],
      },
    );
    s.transactions = [
      transaction({
        postedDate: '2026-10-01',
        amountCents: 90000,
        billId: 'rent',
      }),
      transaction({ postedDate: '2026-10-02', amountCents: 3000 }),
      transaction({
        postedDate: '2026-10-03',
        amountCents: 20000,
        oneTime: true,
      }),
    ];
    expect(estimate(s, '2026-10', '2026-10-04')?.cents).toBe(147000);
    expect(estimate(s, '2026-10', '2026-10-04')?.label).toBe('Early estimate');
  });
  it('uses a separate complete historical month when coverage is stale or uneven', () => {
    const s = emptyState();
    ACCOUNTS.forEach((a) =>
      s.coverage.push({
        id: a,
        account: a,
        from: '2026-09-01',
        through: '2026-09-30',
      }),
    );
    s.transactions = [transaction({ amountCents: 30000 })];
    s.coverage.push({
      id: 'oct',
      account: 'Amex',
      from: '2026-10-01',
      through: '2026-10-02',
    });
    const e = estimate(s, '2026-10', '2026-10-12');
    expect(e?.label).toBe('Historical planning estimate');
    expect(e?.cents).toBe(31000);
    expect(e?.detail).toContain('September 2026');
  });
  it('omits estimates without aligned current coverage or a complete historical month', () =>
    expect(estimate(emptyState(), '2026-10', '2026-10-04')).toBeNull());
  it('clamps bill dates and availability notices, and old uploads do not clear notices', () => {
    expect(billDue('2027-02', 31)).toBe('2027-02-28');
    const s = emptyState();
    s.preferences.statementDays.Amex = 5;
    s.coverage.push({
      id: 'old',
      account: 'Amex',
      from: '2026-09-01',
      through: '2026-09-23',
      confirmedAt: '2026-09-30T16:00:00Z',
    });
    expect(updateNotice(s, 'Amex', '2026-10-05')).toBe('Statement update due');
    s.coverage.push({
      id: 'new',
      account: 'Amex',
      from: '2026-09-24',
      through: '2026-09-30',
      confirmedAt: '2026-10-05T16:00:00Z',
    });
    expect(updateNotice(s, 'Amex', '2026-10-05')).toBeNull();
  });
  it('uses New York dates across a UTC month boundary', () =>
    expect(todayNY(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-30'));
});
