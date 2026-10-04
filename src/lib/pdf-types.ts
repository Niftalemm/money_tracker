import { z } from 'zod';
import { ACCOUNTS } from './model';
export const PDF_LIMITS = {
  bytes: 10 * 1024 * 1024,
  pages: 40,
  milliseconds: 20_000,
  characters: 2_000_000,
  items: 100_000,
  lines: 25_000,
  rows: 2500,
} as const;
export const PDF_GROUPS = [
  'purchases',
  'payments',
  'credits',
  'payments-and-credits',
  'fees',
  'interest',
  'deposits',
  'withdrawals',
  'checks',
  'unknown',
] as const;
export type PdfGroup = (typeof PDF_GROUPS)[number];
export const GROUP_LABELS: Record<PdfGroup, string> = {
  purchases: 'Purchases / new charges',
  payments: 'Card payments',
  credits: 'Refunds / other credits',
  'payments-and-credits': 'Payments and credits combined',
  fees: 'Fees',
  interest: 'Interest charged',
  deposits: 'Deposits / additions',
  withdrawals: 'Withdrawals / subtractions',
  checks: 'Checks',
  unknown: 'Section needs review',
};
export type PdfLine = { page: number; text: string };
export const pdfRowSchema = z
  .object({
    id: z.string().max(80),
    page: z.number().int().min(1).max(PDF_LIMITS.pages),
    date: z.string().max(10),
    purchaseDate: z.string().max(10).optional(),
    merchant: z.string().max(1000),
    amountCents: z.number().int().min(0).max(100_000_000_000),
    group: z.enum(PDF_GROUPS),
    type: z.enum(['purchase', 'refund', 'transfer', 'income']),
    dateUncertain: z.boolean(),
    pending: z.boolean(),
  })
  .strict();
export type PdfRow = z.infer<typeof pdfRowSchema>;
export const pdfStatementSchema = z
  .object({
    account: z.enum(ACCOUNTS),
    pages: z.number().int().min(1).max(PDF_LIMITS.pages),
    parserVersion: z.string().max(30),
    kind: z.enum(['card', 'deposit']),
    rows: z.array(pdfRowSchema).max(PDF_LIMITS.rows),
    totals: z
      .array(
        z
          .object({
            group: z.enum(PDF_GROUPS),
            cents: z.number().int().min(0).max(100_000_000_000),
            page: z.number().int().min(1).max(PDF_LIMITS.pages),
          })
          .strict(),
      )
      .max(100),
    warnings: z
      .array(
        z.enum([
          'dates',
          'unknown-sections',
          'missing-totals',
          'layout-unvalidated',
          'no-cycle',
          'ambiguous-rows',
          'inconsistent-totals',
        ]),
      )
      .max(10),
    cycleFrom: z.string().max(10).optional(),
    cycleThrough: z.string().max(10).optional(),
  })
  .strict();
export type PdfStatement = z.infer<typeof pdfStatementSchema>;
export function requiredGroups(
  statement: Pick<PdfStatement, 'kind' | 'totals' | 'rows'>,
): PdfGroup[] {
  if (statement.kind === 'deposit')
    return ['deposits', 'withdrawals', 'checks', 'fees'];
  const combined =
    statement.totals.some((t) => t.group === 'payments-and-credits') ||
    statement.rows.some((r) => r.group === 'payments-and-credits');
  return [
    'purchases',
    ...(combined
      ? ['payments-and-credits' as const]
      : ['payments' as const, 'credits' as const]),
    'fees',
    'interest',
  ];
}
