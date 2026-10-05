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
      if (account !== 'Amex')
        expect(s.warnings).toContain('layout-unvalidated');
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
});
