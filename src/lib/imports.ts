import Papa from 'papaparse';
import {
  EARLIEST,
  START,
  TYPES,
  transactionSchema,
  uid,
  type Account,
  type TrackerState,
  type Transaction,
  type TransactionType,
} from './model';
import { merchantBrand } from './merchants';
export const MAX_FILE = 10 * 1024 * 1024;
export type Sheet = { headers: string[]; rows: Record<string, string>[] };
export type Mapping = {
  date: string;
  merchant: string;
  amount: string;
  debit: string;
  credit: string;
  id: string;
  status: string;
  purchaseDate: string;
  type?: string;
  dateFormat: 'iso' | 'mdy';
  signs: 'positive-purchase' | 'negative-purchase' | 'debit-credit';
};
export type PreviewRow = {
  row: number;
  transaction?: Transaction;
  error?: string;
  pending?: boolean;
  suggestion?: string;
  matchId?: string;
  matchKind?: 'stable' | 'possible' | 'manual';
  decision: 'include' | 'skip' | 'link' | 'review';
};
export function parseMoney(value: string): number {
  const cleaned = value.trim().replace(/[$,\s]/g, '');
  const normalized = /^\(.*\)$/.test(cleaned)
    ? '-' + cleaned.slice(1, -1)
    : cleaned;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error('Amount must be a number with at most two decimal places.');
  const [whole, fraction = ''] = normalized.replace('-', '').split('.');
  const result = +whole * 100 + +fraction.padEnd(2, '0');
  if (!Number.isSafeInteger(result) || result > 100_000_000_000)
    throw new Error('Amount is too large.');
  return normalized.startsWith('-') ? -result : result;
}
export function parseDate(value: string, format: Mapping['dateFormat']) {
  const match =
    format === 'iso'
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
      : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match)
    throw new Error(
      `Date must use ${format === 'iso' ? 'YYYY-MM-DD' : 'MM/DD/YYYY'}.`,
    );
  const result =
    format === 'iso'
      ? value.trim()
      : `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  if (
    Number.isNaN(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    throw new Error('Invalid calendar date.');
  return result;
}
export function validateFilename(name: string, size: number) {
  if (size > MAX_FILE) throw new Error('Files must be 10 MB or smaller.');
  if (!/\.(csv|xlsx)$/i.test(name))
    throw new Error(
      'Choose CSV or XLSX for column mapping. Use the PDF statement workflow for PDFs. Macros are rejected.',
    );
}
export async function readImport(file: File): Promise<Sheet> {
  validateFilename(file.name, file.size);
  let matrix: string[][];
  if (/\.csv$/i.test(file.name)) {
    const result = Papa.parse<string[]>(await file.text(), {
      skipEmptyLines: 'greedy',
    });
    if (result.errors.length)
      throw new Error('CSV could not be parsed: ' + result.errors[0].message);
    matrix = result.data;
  } else {
    const buffer = await file.arrayBuffer();
    const { default: JSZip } = await import('jszip');
    const archive = await JSZip.loadAsync(buffer);
    const paths = Object.keys(archive.files);
    const expandedBytes = Object.values(archive.files).reduce(
      (total, entry) =>
        total +
        ((entry as unknown as { _data?: { uncompressedSize?: number } })._data
          ?.uncompressedSize ?? 0),
      0,
    );
    if (expandedBytes > 50 * 1024 * 1024)
      throw new Error(
        'Expanded workbook exceeds 50 MB. Use CSV or a smaller workbook.',
      );
    if (
      paths.length > 1000 ||
      paths.some((p) => /vbaProject|macrosheets|externalLinks/i.test(p))
    )
      throw new Error(
        'Macro content and external workbook links are rejected. Export plain CSV or XLSX values.',
      );
    if (!paths.includes('xl/workbook.xml'))
      throw new Error('This is not an XLSX transaction workbook.');
    const contentTypes = await archive
      .file('[Content_Types].xml')
      ?.async('string');
    if (!contentTypes || /macroEnabled|vbaProject/i.test(contentTypes))
      throw new Error(
        'Macro-enabled workbooks are rejected, even with an XLSX filename.',
      );
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    if (workbook.worksheets.length !== 1)
      throw new Error(
        'Use a workbook with one transaction sheet or export that sheet as CSV.',
      );
    const sheet = workbook.worksheets[0];
    if (sheet.rowCount > 50001 || sheet.columnCount > 60)
      throw new Error('Use an export with at most 50,000 rows and 60 columns.');
    matrix = [];
    sheet.eachRow((row) => {
      const values: string[] = [];
      for (let i = 1; i <= sheet.columnCount; i++) {
        const cell = row.getCell(i);
        if (cell.type === ExcelJS.ValueType.Formula)
          throw new Error(
            'Spreadsheet formulas are rejected. Export plain transaction values.',
          );
        const value = cell.value;
        values.push(
          value instanceof Date ? value.toISOString().slice(0, 10) : cell.text,
        );
      }
      matrix.push(values);
    });
  }
  if (matrix.length < 2 || matrix.length > 50001 || matrix[0].length > 60)
    throw new Error(
      'Use a header row followed by 1–50,000 transactions, with at most 60 columns.',
    );
  const headers = matrix[0].map((s) => s.trim());
  if (headers.some((s) => !s) || new Set(headers).size !== headers.length)
    throw new Error('Column headers must be nonempty and unique.');
  const rows = matrix.slice(1).map((row, index) => {
    if (row.length !== headers.length)
      throw new Error(
        `Row ${index + 2} has a different number of columns than the header.`,
      );
    return Object.fromEntries(headers.map((h, i) => [h, row[i]]));
  });
  return { headers, rows };
}
export const normalizedMerchant = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, ' ');
export const fingerprint = (t: Transaction) =>
  `${t.account}|${t.postedDate}|${normalizedMerchant(t.merchant)}|${t.amountCents}|${t.type}`;
// Entries you type yourself ("Starbucks", dated the day you buy) rarely match
// the bank's text ("STARBUCKS STORE 1234 NEW YORK NY") or posting day, so
// they are matched loosely. A match is only ever a suggestion to review.
const NOISE = new Set(
  'the and pos debit credit card purchase mobile checkcard store inc llc www com payment'.split(
    ' ',
  ),
);
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w));
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function similarMerchant(entered: string, statement: string) {
  const brand = merchantBrand(entered);
  if (brand && brand === merchantBrand(statement)) return true;
  const mine = compact(entered);
  if (mine.length >= 4 && compact(statement).includes(mine)) return true;
  const theirs = words(statement);
  return words(entered).some((w) =>
    theirs.some(
      (t) =>
        t === w ||
        (w.length >= 4 && t.startsWith(w)) ||
        (t.length >= 4 && w.startsWith(t)),
    ),
  );
}
/** Banks post up to a few days after you buy (rarely, a day before). */
export const MANUAL_WINDOW = { before: 1, after: 5 } as const;
const day = (iso: string) => Date.parse(iso + 'T00:00:00Z') / 86_400_000;
function manualMatch(
  state: TrackerState,
  claimed: Set<string>,
  row: Transaction,
) {
  let best: Transaction | undefined,
    bestScore = Infinity;
  for (const t of state.transactions) {
    if (
      t.source !== 'manual' ||
      claimed.has(t.id) ||
      t.account !== row.account ||
      t.amountCents !== row.amountCents ||
      !(t.type === row.type || t.type === 'transfer' || t.type === 'income') ||
      (row.bankId && t.bankId && t.bankId !== row.bankId)
    )
      continue;
    const lag = day(row.postedDate) - day(t.postedDate),
      sameDay = row.purchaseDate === t.postedDate;
    if (!sameDay && (lag < -MANUAL_WINDOW.before || lag > MANUAL_WINDOW.after))
      continue;
    // A different description still counts when the day and amount line up.
    const similar = similarMerchant(t.merchant, row.merchant);
    if (!similar && !sameDay && Math.abs(lag) > 2) continue;
    const score = (similar ? 0 : 10) + (sameDay ? 0 : Math.abs(lag));
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}
export function previewImport(
  sheet: Sheet,
  map: Mapping,
  account: Account,
  state: TrackerState,
): PreviewRow[] {
  if (
    !map.date ||
    !map.merchant ||
    (map.signs === 'debit-credit'
      ? !map.debit || !map.credit || map.debit === map.credit
      : !map.amount)
  )
    throw new Error(
      'Map posted date, description, and amount (or separate debit and credit). Confirm the amount convention.',
    );
  const claimed = new Set<string>();
  const seenBankIds = new Set<string>();
  return sheet.rows.map((r, index) => {
    try {
      if (
        map.status &&
        /pending|authorization|authorisation/i.test(r[map.status] ?? '')
      )
        return {
          row: index + 2,
          pending: true,
          error: 'Pending transaction excluded.',
          decision: 'skip',
        };
      const date = parseDate(r[map.date] ?? '', map.dateFormat);
      if (date < EARLIEST)
        throw new Error('Before 2020; dates that old are not supported.');
      const merchant = (r[map.merchant] ?? '').trim();
      if (!merchant) throw new Error('Description is missing.');
      let signed: number;
      if (map.signs === 'debit-credit') {
        const debit = r[map.debit]?.trim() ? parseMoney(r[map.debit]) : 0;
        const credit = r[map.credit]?.trim() ? parseMoney(r[map.credit]) : 0;
        if (debit < 0 || credit < 0 || (debit > 0 && credit > 0))
          throw new Error(
            'Debit and credit must be nonnegative; only one may be nonzero.',
          );
        signed = debit - credit;
      } else
        signed =
          parseMoney(r[map.amount] ?? '') *
          (map.signs === 'negative-purchase' ? -1 : 1);
      if (signed === 0)
        throw new Error('Zero amount; no purchase or credit to import.');
      const mappedType = map.type ? r[map.type] : undefined;
      if (mappedType && !TYPES.includes(mappedType as TransactionType))
        throw new Error('Invalid transaction type.');
      const type: TransactionType = mappedType
        ? (mappedType as TransactionType)
        : signed > 0
          ? 'purchase'
          : 'refund';
      const bankId = map.id ? (r[map.id] ?? '').trim() || undefined : undefined;
      if (bankId && seenBankIds.has(bankId))
        throw new Error(
          'Repeated bank transaction ID in this file. Resolve it before importing.',
        );
      if (bankId) seenBankIds.add(bankId);
      const rule = state.rules.find((rule) =>
        normalizedMerchant(merchant).includes(normalizedMerchant(rule.match)),
      );
      const transaction = transactionSchema.parse({
        id: uid(),
        postedDate: date,
        purchaseDate:
          map.purchaseDate && r[map.purchaseDate]
            ? parseDate(r[map.purchaseDate], map.dateFormat)
            : undefined,
        merchant,
        amountCents: Math.abs(signed),
        account,
        type,
        category: rule?.category ?? 'Uncategorized',
        notes: '',
        source: 'import',
        bankId,
        batchIds: [],
        oneTime: false,
        reimbursementCents: 0,
      });
      const stable = bankId
        ? state.transactions.find(
            (t) => t.account === account && t.bankId === bankId,
          )
        : undefined;
      if (
        stable &&
        (stable.postedDate !== date ||
          stable.amountCents !== transaction.amountCents)
      )
        throw new Error(
          'Existing bank ID has a different date or amount. Resolve this conflict before import.',
        );
      const possible = !stable
        ? state.transactions.find(
            (t) =>
              !claimed.has(t.id) &&
              t.account === account &&
              t.postedDate === date &&
              normalizedMerchant(t.merchant) === normalizedMerchant(merchant) &&
              t.amountCents === Math.abs(signed) &&
              (t.type === type ||
                t.type === 'transfer' ||
                t.type === 'income') &&
              !(bankId && t.bankId && t.bankId !== bankId),
          )
        : undefined;
      const loose =
        !stable && !possible
          ? manualMatch(state, claimed, transaction)
          : undefined;
      const match = stable ?? possible ?? loose;
      if (match) claimed.add(match.id);
      const suggestion = /payment|transfer|autopay/i.test(merchant)
        ? 'Possible card payment or transfer. Confirm type; merchant text is only a suggestion.'
        : signed < 0
          ? 'Credit: verify refund, income, or transfer.'
          : undefined;
      return {
        row: index + 2,
        transaction,
        suggestion,
        matchId: match?.id,
        matchKind: stable
          ? 'stable'
          : (possible ?? loose)?.source === 'manual'
            ? 'manual'
            : possible
              ? 'possible'
              : undefined,
        decision: stable ? 'link' : possible || loose ? 'review' : 'include',
      };
    } catch (e) {
      return {
        row: index + 2,
        error: e instanceof Error ? e.message : 'Invalid row',
        decision: 'skip',
      };
    }
  });
}
export function confirmImport(
  state: TrackerState,
  rows: PreviewRow[],
  account: Account,
  coverage?: { from: string; through: string },
  pdfReview?: import('./pdf-review').PdfProof,
): TrackerState {
  if (rows.some((r) => r.decision === 'review'))
    throw new Error('Review all possible duplicates before confirming.');
  if (
    !rows.some(
      (r) =>
        r.transaction && (r.decision === 'include' || r.decision === 'link'),
    ) &&
    !coverage
  )
    throw new Error('No valid transactions or confirmed coverage to save.');
  if (
    coverage &&
    (coverage.from < EARLIEST || coverage.from > coverage.through)
  )
    throw new Error('Invalid coverage range.');
  const next = structuredClone(state),
    batchId = uid();
  let added = 0,
    duplicates = 0;
  rows.forEach((r) => {
    if (!r.transaction || r.decision === 'skip') return;
    if (r.decision === 'link' && r.matchId) {
      const existing = next.transactions.find((t) => t.id === r.matchId);
      if (!existing)
        throw new Error('Duplicate match no longer exists. Review again.');
      if (existing.source === 'manual') {
        // Keep the manual entry's ID and edits; confirm the bank identity only.
        existing.bankId = r.transaction.bankId ?? existing.bankId;
      }
      existing.batchIds = [...new Set([...existing.batchIds, batchId])];
      duplicates++;
    } else {
      next.transactions.push({ ...r.transaction, batchIds: [batchId] });
      added++;
    }
  });
  next.batches.push({
    id: batchId,
    account,
    importedAt: new Date().toISOString(),
    added,
    duplicates,
    pdfReview,
  });
  if (coverage)
    next.coverage.push({
      id: uid(),
      account,
      ...coverage,
      batchId,
      confirmedAt: new Date().toISOString(),
    });
  return next;
}
export function undoImport(state: TrackerState, batchId: string): TrackerState {
  const next = structuredClone(state);
  next.transactions = next.transactions
    .map((t) => ({ ...t, batchIds: t.batchIds.filter((id) => id !== batchId) }))
    .filter((t) => t.source === 'manual' || t.batchIds.length > 0);
  const remaining = new Set(next.transactions.map((t) => t.id));
  next.transactions.forEach((t) => {
    if (t.reimbursementFor && !remaining.has(t.reimbursementFor))
      delete t.reimbursementFor;
  });
  next.coverage = next.coverage.filter((c) => c.batchId !== batchId);
  next.batches = next.batches.filter((b) => b.id !== batchId);
  return next;
}
/** Coverage to suggest after a preview: the statement period when known,
 * otherwise the file's posted-date range. */
export function suggestedCoverage(
  rows: PreviewRow[],
  period?: { from?: string; through?: string },
) {
  const dates = rows
    .map((r) => r.transaction?.postedDate)
    .filter((d): d is string => !!d)
    .sort();
  const from = period?.from ?? dates[0],
    through = period?.through ?? dates.at(-1);
  const beforeTracking =
    !rows.some((r) => r.transaction) &&
    (through
      ? through < EARLIEST
      : rows.some((r) => r.error?.startsWith('Before 2020')));
  return {
    beforeTracking,
    period: period?.through
      ? { from: period.from, through: period.through }
      : undefined,
    from: !from || from < EARLIEST ? (through ?? START) : from,
    through: through ?? from ?? START,
  };
}
