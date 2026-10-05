// Several statements at once. Each statement is still reconciled against its
// own totals and saved as its own import batch (with its own undo), but the
// owner reviews them together: statements that balance go through with one
// set of confirmations, anything uncertain is collected into one review.
import type { Account, TrackerState } from './model';
import {
  GROUP_LABELS,
  PDF_GROUPS,
  type PdfGroup,
  type PdfStatement,
} from './pdf-types';
import { preparePdf, reconciliation } from './pdf-review';
import { confirmImport, previewImport, type PreviewRow } from './imports';
export const MAX_BATCH = 24;
export type Prepared = ReturnType<typeof preparePdf>;
/** The statement's own totals, where it states exactly one per section. */
export function statementTotals(statement: PdfStatement) {
  const result: Partial<Record<PdfGroup, string>> = {};
  for (const group of PDF_GROUPS) {
    const values = [
      ...new Set(
        statement.totals.filter((t) => t.group === group).map((t) => t.cents),
      ),
    ];
    if (values.length === 1) result[group] = (values[0] / 100).toFixed(2);
  }
  return result;
}
/**
 * Prepares a statement without opening its review when it balances on its
 * own: every required section matches the statement's printed total, every
 * row has a date and a section, and nothing was ambiguous. Otherwise returns
 * the reasons it needs a look. Flagged posted dates are covered by the
 * batch-wide date confirmation.
 */
export function autoPrepare(statement: PdfStatement): {
  prepared?: Prepared;
  reasons: string[];
} {
  const expected = statementTotals(statement);
  const reasons: string[] = [];
  const open = reconciliation(statement, statement.rows, expected).filter(
    (t) => !t.matches,
  );
  if (open.length)
    reasons.push(
      `Doesn't balance yet: ${open.map((t) => GROUP_LABELS[t.group as PdfGroup] ?? t.group).join(', ')}`,
    );
  if (statement.rows.some((r) => !r.date)) reasons.push('Rows without a date');
  if (statement.rows.some((r) => r.group === 'unknown'))
    reasons.push('Rows without a section');
  if (statement.warnings.includes('ambiguous-rows'))
    reasons.push('Some lines could not be read safely');
  if (statement.warnings.includes('layout-unvalidated'))
    reasons.push('Unfamiliar layout');
  if (!statement.rows.length) reasons.push('No transactions found');
  if (reasons.length) return { reasons };
  try {
    return {
      prepared: preparePdf(statement, statement.rows, expected, {
        dates: true,
        sections: true,
        types: true,
      }),
      reasons,
    };
  } catch (e) {
    return { reasons: [e instanceof Error ? e.message : 'Needs review'] };
  }
}
/** Same period, rows, and totals: the same statement chosen twice. */
export function sameStatement(a: PdfStatement, b: PdfStatement) {
  const key = (s: PdfStatement) =>
    JSON.stringify([
      s.cycleFrom,
      s.cycleThrough,
      s.rows.length,
      s.rows.reduce((sum, r) => sum + r.amountCents, 0),
    ]);
  return key(a) === key(b);
}
/**
 * Previews statements oldest first. Each one is matched against your records
 * plus the earlier statements in the batch, so overlaps between files are
 * caught too.
 */
export function previewBatch(
  state: TrackerState,
  account: Account,
  prepared: Prepared[],
): PreviewRow[][] {
  let provisional = state;
  return prepared.map((p) => {
    const rows = previewImport(p.sheet, p.map, account, provisional);
    try {
      provisional = confirmImport(
        provisional,
        rows.map((r) =>
          r.decision === 'review' ? { ...r, decision: 'include' } : r,
        ),
        account,
        undefined,
        p.proof,
      );
    } catch {
      // Nothing valid in this statement; later ones match against the rest.
    }
    return rows;
  });
}
/** Saves each statement as its own import batch, in order. */
export function commitBatch(
  state: TrackerState,
  account: Account,
  entries: Array<{
    rows: PreviewRow[];
    proof: Prepared['proof'];
    coverage?: { from: string; through: string };
  }>,
) {
  let next = state;
  for (const e of entries)
    if (
      e.rows.some((r) => r.transaction && r.decision !== 'skip') ||
      e.coverage
    )
      next = confirmImport(next, e.rows, account, e.coverage, e.proof);
  return next;
}
