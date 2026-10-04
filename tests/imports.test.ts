import { describe, expect, it } from 'vitest';
import {
  confirmImport,
  parseDate,
  parseMoney,
  previewImport,
  undoImport,
  validateFilename,
  type Mapping,
  type Sheet,
} from '../src/lib/imports';
import { emptyState, stateSchema } from '../src/lib/model';
const mapping: Mapping = {
  date: 'Date',
  merchant: 'Description',
  amount: 'Amount',
  debit: '',
  credit: '',
  id: '',
  status: 'Status',
  purchaseDate: '',
  dateFormat: 'iso',
  signs: 'positive-purchase',
};
const sheet = (data: [string, string, string, string?][]): Sheet => ({
  headers: ['Date', 'Description', 'Amount', 'Status'],
  rows: data.map(([Date, Description, Amount, Status = 'Posted']) => ({
    Date,
    Description,
    Amount,
    Status,
  })),
});
describe('import and deduplication', () => {
  it('uses integer cents and explicit sign conventions', () => {
    expect(parseMoney('$1,234.50')).toBe(123450);
    expect(parseMoney('(5.09)')).toBe(-509);
    expect(() => parseMoney('1.234')).toThrow();
    const s = emptyState(),
      file = sheet([['2026-09-03', 'Shop', '-50']]);
    expect(previewImport(file, mapping, 'Amex', s)[0].transaction?.type).toBe(
      'refund',
    );
    expect(
      previewImport(
        file,
        { ...mapping, signs: 'negative-purchase' },
        'Amex',
        s,
      )[0].transaction?.type,
    ).toBe('purchase');
  });
  it('rejects invalid dates, pre-September rows, pending rows, macros, and oversized files', () => {
    expect(() => parseDate('2026-02-30', 'iso')).toThrow();
    expect(parseDate('9/30/2026', 'mdy')).toBe('2026-09-30');
    const p = previewImport(
      sheet([
        ['2026-08-31', 'Shop', '50'],
        ['2026-09-03', 'Shop', '50', 'Pending'],
        ['bad', 'Shop', '3'],
        ['2026-09-03', 'Shop', '1.234'],
      ]),
      mapping,
      'Amex',
      emptyState(),
    );
    expect(p.every((r) => !r.transaction)).toBe(true);
    expect(p[1].pending).toBe(true);
    expect(() => validateFilename('sample.xlsm', 4)).toThrow();
    expect(() => validateFilename('sample.csv', 10485761)).toThrow();
  });
  it('preserves identical purchases within a file and reviews overlaps by occurrence', () => {
    const f = sheet([
      ['2026-09-03', 'Same shop', '50'],
      ['2026-09-03', 'Same shop', '50'],
    ]);
    let s = confirmImport(
      emptyState(),
      previewImport(f, mapping, 'Amex', emptyState()),
      'Amex',
    );
    expect(s.transactions.length).toBe(2);
    s.transactions[0].category = 'Dining';
    const p = previewImport(f, mapping, 'Amex', s);
    expect(p.every((r) => r.decision === 'review')).toBe(true);
    expect(new Set(p.map((r) => r.matchId)).size).toBe(2);
    expect(() => confirmImport(s, p, 'Amex')).toThrow();
    s = confirmImport(
      s,
      p.map((r) => ({ ...r, decision: 'link' })),
      'Amex',
    );
    expect(s.transactions.length).toBe(2);
    expect(s.transactions[0].category).toBe('Dining');
    s = undoImport(s, s.batches[1].id);
    expect(s.transactions.length).toBe(2);
  });
  it('stable IDs preserve category edits, even if merchant/type was edited', () => {
    const m = { ...mapping, id: 'Description' },
      f = sheet([['2026-09-03', 'id-1', '50']]);
    let s = confirmImport(
      emptyState(),
      previewImport(f, m, 'Amex', emptyState()),
      'Amex',
    );
    s.transactions[0].category = 'Other';
    s.transactions[0].merchant = 'My corrected merchant';
    s.transactions[0].type = 'transfer';
    const p = previewImport(f, m, 'Amex', s);
    expect(p[0].matchKind).toBe('stable');
    s = confirmImport(s, p, 'Amex');
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].category).toBe('Other');
    expect(s.transactions[0].type).toBe('transfer');
  });
  it('never silently merges manual entries; linking preserves ID and undo keeps manual', () => {
    const f = sheet([['2026-09-03', 'Shop', '50']]),
      p = previewImport(f, mapping, 'Amex', emptyState());
    const s = emptyState();
    s.transactions = [{ ...p[0].transaction!, source: 'manual' }];
    const review = previewImport(f, mapping, 'Amex', s);
    expect(review[0].matchKind).toBe('manual');
    expect(review[0].decision).toBe('review');
    const linked = confirmImport(
      s,
      review.map((r) => ({ ...r, decision: 'link' })),
      'Amex',
    );
    expect(linked.transactions[0].id).toBe(s.transactions[0].id);
    expect(undoImport(linked, linked.batches[0].id).transactions).toHaveLength(
      1,
    );
  });
  it('undo removes only orphaned imported records and its coverage', () => {
    const f = sheet([['2026-09-03', 'Shop', '50']]);
    const s = confirmImport(
      emptyState(),
      previewImport(f, mapping, 'Amex', emptyState()),
      'Amex',
      { from: '2026-09-01', through: '2026-09-23' },
    );
    const undone = undoImport(s, s.batches[0].id);
    expect(undone.transactions).toHaveLength(0);
    expect(undone.coverage).toHaveLength(0);
    expect(s.coverage[0].through).toBe('2026-09-23');
  });
  it('text suggesting transfer does not classify it silently', () => {
    const p = previewImport(
      sheet([['2026-09-03', 'Card payment', '50']]),
      mapping,
      'Bank of America',
      emptyState(),
    );
    expect(p[0].transaction?.type).toBe('purchase');
    expect(p[0].suggestion).toContain('Possible');
    p[0].transaction!.type = 'transfer';
    const s = confirmImport(emptyState(), p, 'Bank of America');
    expect(s.transactions[0].type).toBe('transfer');
  });
  it('rejects conflicting IDs and ambiguous debit/credit values', () => {
    const f = sheet([['2026-09-03', 'id-1', '50']]),
      m = { ...mapping, id: 'Description' };
    const s = confirmImport(
      emptyState(),
      previewImport(f, m, 'Amex', emptyState()),
      'Amex',
    );
    expect(
      previewImport(sheet([['2026-09-03', 'id-1', '60']]), m, 'Amex', s)[0]
        .error,
    ).toContain('different');
    expect(() =>
      previewImport(
        f,
        {
          ...mapping,
          signs: 'debit-credit',
          debit: 'Amount',
          credit: 'Amount',
        },
        'Amex',
        s,
      ),
    ).toThrow();
  });
  it('validates reimbursement and bill links during restore', () => {
    const s = emptyState();
    const row = previewImport(
      sheet([['2026-09-03', 'Shop', '50']]),
      mapping,
      'Amex',
      s,
    )[0].transaction!;
    s.transactions = [{ ...row, reimbursementFor: 'missing' }];
    expect(() => stateSchema.parse(s)).toThrow();
  });
});
