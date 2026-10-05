import { describe, expect, it, vi } from 'vitest';
import {
  adaptPdf,
  pdfDate,
  pdfAmount,
  linesFromItems,
} from '../src/lib/pdf-adapters';
import { preparePdf, reconciliation } from '../src/lib/pdf-review';
import { parsePdf } from '../src/lib/pdf-client';
import { ACCOUNTS, emptyState } from '../src/lib/model';
import { previewImport, confirmImport } from '../src/lib/imports';
import { syntheticLines } from './pdf-fixtures';
const checks = { dates: true, sections: true, types: true };
function fixture(
  account: (typeof ACCOUNTS)[number],
  deposit = false,
  missing = false,
) {
  return adaptPdf(
    syntheticLines(account, missing, deposit).map((text) => ({
      page: 1,
      text,
    })),
    account,
    1,
    'synthetic',
  );
}
function expected(statement: ReturnType<typeof fixture>) {
  return Object.fromEntries(
    statement.totals.map((t) => [t.group, (t.cents / 100).toFixed(2)]),
  );
}
describe('local bank adapters and mandatory PDF reconciliation', () => {
  for (const account of ACCOUNTS)
    it(`reconciles ${account}, retains August for totals, excludes it from tracking, and flags overlapping imports`, () => {
      const s = fixture(account);
      expect(s.rows).toHaveLength(4);
      expect(
        reconciliation(s, s.rows, expected(s)).every((t) => t.matches),
      ).toBe(true);
      const prepared = preparePdf(s, s.rows, expected(s), checks);
      const review = previewImport(
        prepared.sheet,
        prepared.map,
        account,
        emptyState(),
      );
      expect(review[0].error).toContain('Before September');
      expect(review[2].transaction?.type).toBe('transfer');
      const saved = confirmImport(
        emptyState(),
        review,
        account,
        undefined,
        prepared.proof,
      );
      expect(saved.transactions).toHaveLength(3);
      expect(
        previewImport(prepared.sheet, prepared.map, account, saved).filter(
          (r) => r.decision === 'review',
        ),
      ).toHaveLength(3);
      expect(s.warnings).not.toContain('layout-unvalidated');
    });
  it('supports a Bank of America deposit ledger with separately reconciled sections', () => {
    const s = fixture('Bank of America', true);
    expect(s.kind).toBe('deposit');
    const prepared = preparePdf(s, s.rows, expected(s), checks);
    expect(
      previewImport(
        prepared.sheet,
        prepared.map,
        'Bank of America',
        emptyState(),
      )[0].transaction?.type,
    ).toBe('income');
  });
  it('blocks missing rows, missing totals, uncertain dates without confirmation, and unknown sections', () => {
    const s = fixture('Amex', false, true);
    expect(() => preparePdf(s, s.rows, expected(s), checks)).toThrow(
      'must match',
    );
    const valid = fixture('Amex');
    expect(() => preparePdf(valid, valid.rows, {}, checks)).toThrow(
      'must match',
    );
    expect(() =>
      preparePdf(valid, valid.rows, expected(valid), {
        ...checks,
        dates: false,
      }),
    ).toThrow('Confirm');
    expect(() =>
      preparePdf(
        valid,
        valid.rows.map((r) => ({ ...r, group: 'unknown' })),
        expected(valid),
        checks,
      ),
    ).toThrow('sections');
    expect(() =>
      preparePdf(
        valid,
        valid.rows.map((r) => ({ ...r, date: '2026-02-30' })),
        expected(valid),
        checks,
      ),
    ).toThrow('Invalid');
  });
  it('preserves posted and purchase dates in either two-column order', () => {
    for (const [heading, date, purchaseDate] of [
      [
        'Posted Date Transaction Date Description Amount',
        '2026-09-03',
        '2026-09-02',
      ],
      [
        'Transaction Date Posted Date Description Amount',
        '2026-09-02',
        '2026-09-03',
      ],
    ]) {
      const s = adaptPdf(
        [
          { page: 1, text: 'Capital One' },
          { page: 1, text: heading },
          { page: 1, text: 'Purchases' },
          { page: 1, text: '09/03/2026 09/02/2026 Synthetic shop $12.34' },
        ],
        'Capital One',
        1,
        'test',
      );
      expect(s.rows[0].date).toBe(date);
      expect(s.rows[0].purchaseDate).toBe(purchaseDate);
    }
  });
  it('does not treat incidental posted text as a verified date header', () => {
    const s = adaptPdf(
      [
        { page: 1, text: 'American Express' },
        { page: 1, text: 'Purchases posted to your account' },
        { page: 1, text: 'New Charges' },
        { page: 1, text: '09/02/2026 Synthetic shop $12.34' },
      ],
      'Amex',
      1,
      'test',
    );
    expect(s.warnings).toContain('dates');
    expect(s.rows[0].dateUncertain).toBe(true);
  });
  it('handles exact amounts, year boundaries, malformed dates, and text bands', () => {
    expect(pdfAmount('$1234.56')).toBe(123456);
    expect(pdfAmount('($1,234.56)')).toBe(123456);
    expect(pdfDate('12/31', '2026-01-23')).toBe('2025-12-31');
    expect(pdfDate('02/30/2026')).toBe('');
    expect(pdfDate('09/02')).toBe('');
    expect(
      linesFromItems(1, [
        { str: '$25.00', transform: [1, 0, 0, 1, 300, 100] },
        { str: '09/02 Store', transform: [1, 0, 0, 1, 20, 100] },
      ])[0].text,
    ).toBe('09/02 Store $25.00');
    const s = adaptPdf(
      [
        { page: 1, text: 'American Express' },
        { page: 1, text: 'Closing Date 09/23/2026' },
        { page: 1, text: 'New Charges' },
        { page: 1, text: '09/02 Store $1,234.56' },
      ],
      'Amex',
      1,
      'test',
    );
    expect(s.rows[0].amountCents).toBe(123456);
    expect(s.rows[0].dateUncertain).toBe(true);
  });
});
describe('hard PDF worker cancellation and limits', () => {
  it('terminates an unresponsive parser without surfacing financial errors', async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    const worker = { terminate, postMessage: vi.fn() } as unknown as Worker;
    const file = {
      name: 'fake.pdf',
      size: 10,
      arrayBuffer: async () => new ArrayBuffer(10),
    } as File;
    const result = parsePdf(file, 'Amex', undefined, () => worker);
    const assertion = expect(result).rejects.toThrow('20 seconds');
    await vi.advanceTimersByTimeAsync(20_001);
    await assertion;
    expect(terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
  it('aborts on lock/close and rejects oversized input before creating a worker', async () => {
    const terminate = vi.fn(),
      factory = vi.fn(
        () => ({ terminate, postMessage: vi.fn() }) as unknown as Worker,
      );
    await expect(
      parsePdf(
        { name: 'fake.pdf', size: 11 * 1024 * 1024 } as File,
        'Amex',
        undefined,
        factory,
      ),
    ).rejects.toThrow('10 MB');
    expect(factory).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = parsePdf(
      {
        name: 'fake.pdf',
        size: 10,
        arrayBuffer: async () => new ArrayBuffer(10),
      } as File,
      'Amex',
      controller.signal,
      factory,
    );
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(terminate).toHaveBeenCalledOnce();
  });

  // Synthetic text that mirrors each bank's real statement layout (checked
  // locally against one real statement per bank; none is stored here).
  const lines = (texts: string[], page = 1) =>
    texts.map((text) => ({ page, text }));
  const settled = (s: ReturnType<typeof adaptPdf>) => {
    const totals = reconciliation(s, s.rows, expected(s));
    return totals.every((t) => t.matches) ? totals.map((t) => t.group) : totals;
  };
  it('reads the Capital One layout: cycle range, combined payments, itemized interest', () => {
    const s = adaptPdf(
      [
        ...lines([
          'Page 1 of 3',
          'Savor Credit Card | World Elite Mastercard ending in 0000',
          'Aug 10, 2026 - Sep 08, 2026 | 30 days in Billing Cycle',
          'Payment Due Date For online and phone payments, the Previous Balance $100.00',
          'Oct 03, 2026 on the statement closing date when Payments - $20.00',
          'Other Credits $0.00',
          'Transactions + $30.00',
          'Cash Advances + $0.00',
          'Fees Charged + $0.00',
          'Interest Charged + $1.50',
          'Pay or manage your account at capitalone.com',
        ]),
        ...lines(
          [
            '$0.00 for each Billing Cycle if your account is subject to an Interest Charge. • Account information',
          ],
          2,
        ),
        ...lines(
          [
            'Aug 10, 2026 - Sep 08, 2026 | 30 days in Billing Cycle',
            'SAMPLE NAME #0000: Payments, Credits and Adjustments',
            'Trans Date Post Date Description Amount',
            'Sep 3 Sep 3 CAPITAL ONE AUTOPAY PYMT - $20.00',
            'SAMPLE NAME #0000: Transactions',
            'Trans Date Post Date Description Amount',
            'Aug 30 Aug 31 SYNTHETIC BOOKS CITY ST $10.00',
            'Sep 4 Sep 5 SYNTHETIC CAFE CITY ST $20.00',
            'SAMPLE NAME #0000: Total Transactions $30.00',
            'Total Transactions for This Period $30.00',
            'Fees',
            'Trans Date Post Date Description Amount',
            'Total Fees for This Period $0.00',
            'Interest Charged',
            'Interest Charge on Purchases $1.50',
            'Interest Charge on Cash Advances $0.00',
            'Total Interest for This Period $1.50',
            'Totals Year-to-Date',
            'Total Fees charged $25.00',
            'Total Interest charged $9.99',
          ],
          3,
        ),
      ],
      'Capital One',
      3,
      'test',
    );
    expect([s.cycleFrom, s.cycleThrough]).toEqual(['2026-08-10', '2026-09-08']);
    expect(s.warnings).toEqual([]);
    expect(settled(s)).toEqual([
      'purchases',
      'payments-and-credits',
      'fees',
      'interest',
    ]);
    const [payment, books, cafe, interest] = s.rows;
    expect(payment).toMatchObject({ type: 'transfer', date: '2026-09-03' });
    expect(books).toMatchObject({
      date: '2026-08-31',
      purchaseDate: '2026-08-30',
      dateUncertain: false,
    });
    expect(cafe.date).toBe('2026-09-05');
    expect(interest).toMatchObject({
      group: 'interest',
      date: '2026-09-08',
      amountCents: 150,
      merchant: 'Interest Charge on Purchases',
    });
  });
  it('reads the Bank of America ledger: card and other subtractions reconcile separately', () => {
    const s = adaptPdf(
      [
        ...lines([
          'Bank of America',
          'Your Adv SafeBalance Banking',
          'for August 15, 2026 to September 15, 2026 Account number: 0000 0000 0000',
          'Beginning balance on August 15, 2026 $500.00',
          'Deposits and other additions 300.00',
          'ATM and debit card subtractions -45.00',
          'Other subtractions -100.00',
          'Service fees -0.00',
          'Ending balance on September 15, 2026 $655.00',
        ]),
        ...lines(
          [
            'Deposits and other additions',
            'Date Description Amount',
            '08/28/26 SYNTHETIC EMPLOYER DES:PAYROLL 300.00',
            'Total deposits and other additions $300.00',
            'Withdrawals and other subtractions',
            'ATM and debit card subtractions',
            'Date Description Amount',
            '08/19/26 SYNTHETIC MARKET 08/19 #000000000000 MOBILE PURCHASE -20.00',
            'Consider writing fewer checks. Instead, pay bills using our Mobile app.',
          ],
          3,
        ),
        ...lines(
          [
            'Withdrawals and other subtractions - continued',
            'ATM and debit card subtractions - continued',
            'Date Description Amount',
            '08/31/26 SYNTHETIC TRANSIT 08/30 MOBILE PURCHASE -25.00',
            'Total ATM and debit card subtractions -$45.00',
            'Other subtractions',
            'Date Description Amount',
            '09/02/26 SYNTHETIC LANDLORD DES:RENT -100.00',
            'Total other subtractions -$100.00',
          ],
          4,
        ),
      ],
      'Bank of America',
      4,
      'test',
    );
    expect(s.kind).toBe('deposit');
    expect([s.cycleFrom, s.cycleThrough]).toEqual(['2026-08-15', '2026-09-15']);
    expect(s.warnings).toEqual([]);
    expect(settled(s)).toEqual([
      'deposits',
      'withdrawals',
      'debit-card',
      'fees',
    ]);
    expect(s.rows.map((r) => [r.date, r.group, r.dateUncertain])).toEqual([
      ['2026-08-28', 'deposits', false],
      ['2026-08-19', 'debit-card', false],
      ['2026-08-31', 'debit-card', false],
      ['2026-09-02', 'withdrawals', false],
    ]);
  });
  it('reads the Amex layout: posting-date marks, separate payment detail, year-to-date totals', () => {
    const s = adaptPdf(
      [
        ...lines([
          'American Express',
          'Closing Date 09/23/26',
          'We will debit your bank account for your payment of $40.00 on',
          '10/08/26. Please make sure funds are available.',
        ]),
        ...lines(
          [
            'Payments and Credits',
            'Summary',
            'Payments -$50.00',
            'Credits $0.00',
            'Total Payments and Credits -$50.00',
            'Detail *Indicates posting date',
            'Payments Amount',
            '09/03/26* MOBILE PAYMENT - THANK YOU -$50.00',
            'New Charges',
            'Summary',
            'Total New Charges $12.00',
            'Detail',
            '09/05/26 SYNTHETIC DELI CITY ST $12.00',
          ],
          3,
        ),
        ...lines(
          [
            'p. 7/7',
            'Fees',
            'Total Fees for this Period $0.00',
            'Interest Charged',
            'Total Interest Charged for this Period $0.00',
            'Days in Billing Period: 30',
            '2026 Fees and Interest Totals Year-to-Date',
            'Total Fees in 2026 $0.00',
            'Total Interest in 2026 $0.97',
          ],
          6,
        ),
      ],
      'Amex',
      6,
      'test',
    );
    // Amex gives a closing date and the number of days in the period.
    expect([s.cycleFrom, s.cycleThrough]).toEqual(['2026-08-25', '2026-09-23']);
    expect(s.warnings).toEqual(['dates']);
    expect(settled(s)).toEqual([
      'purchases',
      'payments',
      'credits',
      'fees',
      'interest',
    ]);
    expect(s.rows.map((r) => [r.group, r.dateUncertain])).toEqual([
      ['payments', false],
      ['purchases', true],
    ]);
  });
});
