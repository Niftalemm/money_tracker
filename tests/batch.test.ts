import { describe, expect, it } from 'vitest';
import { adaptPdf } from '../src/lib/pdf-adapters';
import {
  autoPrepare,
  commitBatch,
  previewBatch,
  sameStatement,
} from '../src/lib/batch';
import { emptyState } from '../src/lib/model';
import { undoImport } from '../src/lib/imports';
// Synthetic Amex-style statements: one per billing period.
const statement = (
  closing: string,
  rows: [string, string, number][],
  total = rows.reduce((sum, r) => sum + r[2], 0),
) =>
  adaptPdf(
    [
      'American Express',
      `Closing Date ${closing}`,
      'Days in Billing Period: 30',
      'Payments and Credits',
      'Summary',
      'Payments $0.00',
      'Credits $0.00',
      'New Charges',
      'Summary',
      `Total New Charges $${(total / 100).toFixed(2)}`,
      'Detail',
      ...rows.map(([d, m, c]) => `${d} ${m} $${(c / 100).toFixed(2)}`),
      'Fees',
      'Total Fees for this Period $0.00',
      'Interest Charged',
      'Total Interest Charged for this Period $0.00',
    ].map((text) => ({ page: 1, text })),
    'Amex',
    1,
    'test',
  );
const july = statement('07/24/26', [
    ['06/28/26', 'SYNTHETIC GROCER', 4200],
    ['07/10/26', 'SYNTHETIC CAFE', 650],
  ]),
  august = statement('08/24/26', [
    ['07/30/26', 'SYNTHETIC BOOKS', 1800],
    ['08/12/26', 'SYNTHETIC CAFE', 650],
  ]);
describe('several statements at once', () => {
  it('prepares statements that balance and explains the ones that do not', () => {
    expect(autoPrepare(july).prepared).toBeDefined();
    const off = statement(
      '09/24/26',
      [['09/01/26', 'SYNTHETIC SHOP', 500]],
      900,
    );
    const result = autoPrepare(off);
    expect(result.prepared).toBeUndefined();
    expect(result.reasons[0]).toContain("Doesn't balance yet");
  });
  it('spots the same statement chosen twice', () => {
    expect(
      sameStatement(
        july,
        statement('07/24/26', [
          ['06/28/26', 'SYNTHETIC GROCER', 4200],
          ['07/10/26', 'SYNTHETIC CAFE', 650],
        ]),
      ),
    ).toBe(true);
    expect(sameStatement(july, august)).toBe(false);
  });
  it('saves each statement as its own import, across months, with separate undo', () => {
    const prepared = [july, august].map((s) => autoPrepare(s).prepared!);
    const previews = previewBatch(emptyState(), 'Amex', prepared);
    expect(previews.flat().every((r) => r.decision === 'include')).toBe(true);
    const saved = commitBatch(
      emptyState(),
      'Amex',
      previews.map((rows, i) => ({
        rows,
        proof: prepared[i].proof,
        coverage: {
          from: [july, august][i].cycleFrom!,
          through: [july, august][i].cycleThrough!,
        },
      })),
    );
    expect(saved.batches).toHaveLength(2);
    expect(saved.transactions.map((t) => t.postedDate).sort()).toEqual([
      '2026-06-28',
      '2026-07-10',
      '2026-07-30',
      '2026-08-12',
    ]);
    expect(saved.coverage.map((c) => [c.from, c.through])).toEqual([
      ['2026-06-25', '2026-07-24'],
      ['2026-07-26', '2026-08-24'],
    ]);
    const undone = undoImport(saved, saved.batches[0].id);
    expect(undone.transactions).toHaveLength(2);
  });
  it('flags overlaps between files in the same batch for a decision', () => {
    const prepared = [july, july].map((s) => autoPrepare(s).prepared!);
    const [first, second] = previewBatch(emptyState(), 'Amex', prepared);
    expect(first.every((r) => r.decision === 'include')).toBe(true);
    expect(second.every((r) => r.decision === 'review')).toBe(true);
    // Linking the second file's rows keeps one copy of each purchase.
    const saved = commitBatch(emptyState(), 'Amex', [
      { rows: first, proof: prepared[0].proof },
      {
        rows: second.map((r) => ({ ...r, decision: 'link' as const })),
        proof: prepared[1].proof,
      },
    ]);
    expect(saved.transactions).toHaveLength(2);
  });
});
