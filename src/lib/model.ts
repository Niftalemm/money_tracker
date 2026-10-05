import { z } from 'zod';
export const ACCOUNTS = ['Amex', 'Bank of America', 'Capital One'] as const;
export const CATEGORIES = [
  'Groceries',
  'Dining',
  'Transit',
  'Housing',
  'Utilities',
  'Subscriptions',
  'Shopping',
  'Health',
  'Other',
  'Uncategorized',
];
export const START = '2026-09-01';
export const TYPES = ['purchase', 'refund', 'transfer', 'income'] as const;
export type Account = (typeof ACCOUNTS)[number];
export type TransactionType = (typeof TYPES)[number];
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    'Invalid calendar date',
  );
const cents = z.number().int().min(0).max(100_000_000_000);
const text = z.string().max(1000);
export const transactionSchema = z
  .object({
    id: z.string().min(1),
    postedDate: date,
    purchaseDate: date.optional(),
    merchant: text.min(1),
    amountCents: cents,
    account: z.enum(ACCOUNTS),
    category: z.string().min(1).max(80),
    type: z.enum(TYPES),
    notes: text,
    source: z.enum(['manual', 'import']),
    bankId: z.string().max(200).optional(),
    batchIds: z.array(z.string()),
    oneTime: z.boolean(),
    reimbursementCents: cents,
    reimbursementFor: z.string().optional(),
    billId: z.string().optional(),
  })
  .refine(
    (t) =>
      t.reimbursementCents <= t.amountCents &&
      (t.reimbursementCents === 0 || t.type === 'purchase'),
    'Reimbursement must fit a purchase',
  )
  .refine((t) => t.postedDate >= START, 'Tracking starts September 1, 2026');
export type Transaction = z.infer<typeof transactionSchema>;
export const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    transactions: z.array(transactionSchema).max(50000),
    categories: z.array(z.string().min(1).max(80)).min(1).max(100),
    rules: z.array(
      z.object({
        id: z.string(),
        match: z.string().min(1).max(200),
        category: z.string().max(80),
      }),
    ),
    batches: z.array(
      z.object({
        id: z.string(),
        account: z.enum(ACCOUNTS),
        importedAt: z.iso.datetime(),
        added: z.number().int(),
        duplicates: z.number().int(),
        pdfReview: z
          .object({
            pages: z.number().int().min(1).max(40),
            parserVersion: z.string().max(30),
            reconciledAt: z.iso.datetime(),
            groups: z
              .array(
                z
                  .object({
                    group: z.string().max(40),
                    expectedCents: cents,
                    actualCents: cents,
                  })
                  .refine((g) => g.expectedCents === g.actualCents),
              )
              .max(10),
          })
          .optional(),
      }),
    ),
    coverage: z.array(
      z
        .object({
          id: z.string(),
          account: z.enum(ACCOUNTS),
          from: date,
          through: date,
          batchId: z.string().optional(),
          confirmedAt: z.iso.datetime().optional(),
        })
        .refine((c) => c.from >= START && c.from <= c.through),
    ),
    bills: z.array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100),
        amountCents: cents,
        category: z.string().max(80),
        dueDay: z.number().int().min(1).max(31),
        confirmedUnpaidMonths: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
      }),
    ),
    preferences: z.object({
      statementDays: z.object({
        Amex: z.number().int().min(1).max(31).nullable(),
        'Bank of America': z.number().int().min(1).max(31).nullable(),
        'Capital One': z.number().int().min(1).max(31).nullable(),
      }),
      weeklyAmex: z.boolean(),
    }),
    updatedAt: z.iso.datetime().nullable(),
  })
  .superRefine((s, ctx) => {
    const ids = new Set(s.transactions.map((t) => t.id));
    if (ids.size !== s.transactions.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate transaction IDs' });
    if (
      new Set(s.categories).size !== s.categories.length ||
      !s.categories.includes('Uncategorized')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Categories must be unique and include Uncategorized',
      });
    for (const list of [s.rules, s.bills, s.batches, s.coverage])
      if (new Set(list.map((i) => i.id)).size !== list.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate record IDs' });
    if (
      [...s.transactions, ...s.rules, ...s.bills].some(
        (t) => !s.categories.includes(t.category),
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Unknown category reference' });
    if (
      s.transactions.some((t) =>
        t.batchIds.some((id) => !s.batches.some((b) => b.id === id)),
      ) ||
      s.coverage.some(
        (c) => c.batchId && !s.batches.some((b) => b.id === c.batchId),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Missing import batch reference',
      });
    const reimbursed = new Set<string>();
    const paid = new Set<string>();
    for (const t of s.transactions) {
      if (t.reimbursementFor) {
        const target = s.transactions.find((p) => p.id === t.reimbursementFor);
        if (
          !target ||
          target.type !== 'purchase' ||
          target.reimbursementCents !== t.amountCents ||
          !['refund', 'income'].includes(t.type) ||
          reimbursed.has(target.id)
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Reimbursement must match one confirmed shared amount',
          });
        reimbursed.add(t.reimbursementFor);
      }
      if (t.billId) {
        const key = t.billId + t.postedDate.slice(0, 7);
        if (
          t.type !== 'purchase' ||
          !s.bills.some((b) => b.id === t.billId) ||
          paid.has(key)
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Link one purchase per bill per month',
          });
        paid.add(key);
      }
    }
  });
export type TrackerState = z.infer<typeof stateSchema>;
export function emptyState(): TrackerState {
  return {
    schemaVersion: 1,
    transactions: [],
    categories: [...CATEGORIES],
    rules: [],
    batches: [],
    coverage: [],
    bills: [],
    preferences: {
      statementDays: {
        Amex: null,
        'Bank of America': null,
        'Capital One': null,
      },
      weeklyAmex: false,
    },
    updatedAt: null,
  };
}
export const uid = () => crypto.randomUUID();
