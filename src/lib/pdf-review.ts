import { parseDate, parseMoney, type Sheet, type Mapping } from './imports';
import {
  PDF_LIMITS,
  requiredGroups,
  pdfRowSchema,
  type PdfRow,
  type PdfStatement,
  type PdfGroup,
} from './pdf-types';
export type PdfChecks = { dates: boolean; sections: boolean; types: boolean };
export type PdfProof = {
  pages: number;
  parserVersion: string;
  reconciledAt: string;
  groups: Array<{ group: string; expectedCents: number; actualCents: number }>;
};
export function reconciliation(
  statement: PdfStatement,
  rows: PdfRow[],
  expected: Partial<Record<PdfGroup, string>>,
) {
  const groups = [
    ...new Set([
      ...requiredGroups(statement),
      ...rows
        .filter((r) => !r.pending && r.group !== 'unknown')
        .map((r) => r.group),
    ]),
  ];
  return groups.map((group) => {
    const actualCents = rows
      .filter((r) => !r.pending && r.group === group)
      .reduce((sum, r) => sum + r.amountCents, 0);
    let expectedCents: number | undefined;
    try {
      if (expected[group]?.trim()) {
        const cents = parseMoney(expected[group]!);
        if (cents >= 0) expectedCents = cents;
      }
    } catch {
      /* Safe, visible missing total. */
    }
    return {
      group,
      actualCents,
      expectedCents,
      matches: expectedCents !== undefined && actualCents === expectedCents,
    };
  });
}
export function preparePdf(
  statement: PdfStatement,
  rows: PdfRow[],
  expected: Partial<Record<PdfGroup, string>>,
  checks: PdfChecks,
): { sheet: Sheet; map: Mapping; proof: PdfProof } {
  if (!checks.dates || !checks.sections || !checks.types)
    throw new Error(
      'Confirm posted dates, all statement pages and sections, and transaction types.',
    );
  if (!rows.length || rows.length > PDF_LIMITS.rows)
    throw new Error('Review 1–2,500 statement rows.');
  for (const row of rows) {
    pdfRowSchema.parse(row);
    parseDate(row.date, 'iso');
    if (row.purchaseDate) parseDate(row.purchaseDate, 'iso');
    if (
      !row.merchant.trim() ||
      row.group === 'unknown' ||
      (!row.pending && row.amountCents === 0)
    )
      throw new Error(
        'Correct missing descriptions, dates, sections, and zero amounts.',
      );
  }
  const totals = reconciliation(statement, rows, expected);
  if (totals.some((t) => !t.matches))
    throw new Error(
      'Every statement section total must match before continuing. Enter 0 for a confirmed empty section.',
    );
  const headers = [
    'date',
    'purchaseDate',
    'merchant',
    'amount',
    'type',
    'status',
  ];
  return {
    sheet: {
      headers,
      rows: rows.map((row) => ({
        date: row.date,
        purchaseDate: row.purchaseDate ?? '',
        merchant: row.merchant,
        amount: (row.amountCents / 100).toFixed(2),
        type: row.type,
        status: row.pending ? 'pending' : 'posted',
      })),
    },
    map: {
      date: 'date',
      purchaseDate: 'purchaseDate',
      merchant: 'merchant',
      amount: 'amount',
      type: 'type',
      status: 'status',
      debit: '',
      credit: '',
      id: '',
      dateFormat: 'iso',
      signs: 'positive-purchase',
    },
    proof: {
      pages: statement.pages,
      parserVersion: statement.parserVersion,
      reconciledAt: new Date().toISOString(),
      groups: totals.map((t) => ({
        group: t.group,
        actualCents: t.actualCents,
        expectedCents: t.expectedCents!,
      })),
    },
  };
}
