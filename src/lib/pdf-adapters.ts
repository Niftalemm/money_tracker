import type { Account } from './model';
import {
  PDF_LIMITS,
  type PdfGroup,
  type PdfLine,
  type PdfRow,
  type PdfStatement,
} from './pdf-types';

// Text only. No PDF rendering, links, HTML, actions, embedded files, or form execution.
const AMOUNT =
  /(?:-?\$\s*|\(\$?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?(?:\s*(?:CR|DR))?/gi;
const DATE =
  /\b(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?)\b/gi;
const months = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
export function pdfAmount(value: string) {
  const raw = value.replace(/[$()\s]|CR|DR/gi, '').replace(/^-/, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(raw))
    throw new Error('malformed');
  const [whole, fraction] = raw.replace(/,/g, '').split('.');
  const cents = +whole * 100 + +fraction;
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000)
    throw new Error('malformed');
  return cents;
}
function dateParts(
  token: string,
): { month: number; day: number; year?: number } | undefined {
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(token);
  if (slash) {
    const year = slash[3] ? +slash[3] : undefined;
    return {
      month: +slash[1],
      day: +slash[2],
      year: year !== undefined && year < 100 ? 2000 + year : year,
    };
  }
  const word = /^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(token);
  if (word)
    return {
      month: months.indexOf(word[1].slice(0, 3).toLowerCase()) + 1,
      day: +word[2],
      year: word[3] ? +word[3] : undefined,
    };
}
export function pdfDate(token: string, closing?: string) {
  const parts = dateParts(token);
  if (!parts) return '';
  let year = parts.year;
  if (!year && closing) {
    year = +closing.slice(0, 4);
    if (parts.month > +closing.slice(5, 7)) year--;
  }
  if (!year || year < 2000 || year > 2100) return '';
  const value = `${year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
    ? value
    : '';
}
const clean = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export const safeMerchant = (s: string) =>
  clean(s)
    .replace(/\b(?:\d[ -]?){8,}\b/g, '[identifier removed]')
    .slice(0, 1000);
function groupFor(text: string): PdfGroup | undefined {
  const value = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    /payments? (?:and |other )?(?:credits?|adjustments?)|payments? credits?/.test(
      value,
    )
  )
    return 'payments-and-credits';
  if (/deposits?(?: and other additions)?|other additions/.test(value))
    return 'deposits';
  if (
    /withdrawals?(?: and other subtractions)?|other subtractions|electronic withdrawals|debits and withdrawals/.test(
      value,
    )
  )
    return 'withdrawals';
  if (/\bchecks(?: paid)?\b/.test(value)) return 'checks';
  if (/interest charged|interest charges|total interest/.test(value))
    return 'interest';
  if (/\b(?:service )?fees(?: charged| for this period)?\b/.test(value))
    return 'fees';
  if (
    /new charges|purchases(?: and adjustments)?|transactions(?: total)?|cash advances/.test(
      value,
    )
  )
    return 'purchases';
  if (/\b(?:total )?payments?\b/.test(value)) return 'payments';
  if (/\b(?:other |total )?credits?\b/.test(value)) return 'credits';
}
function rowType(group: PdfGroup): PdfRow['type'] {
  return group === 'payments'
    ? 'transfer'
    : group === 'credits' || group === 'payments-and-credits'
      ? 'refund'
      : group === 'deposits'
        ? 'income'
        : 'purchase';
}
export function linesFromItems(
  page: number,
  items: Array<{ str: string; transform: number[] }>,
) {
  const bands: Array<{ y: number; items: Array<{ x: number; text: string }> }> =
    [];
  for (const item of items) {
    if (
      !item.str ||
      !Array.isArray(item.transform) ||
      item.transform.length < 6 ||
      !Number.isFinite(item.transform[4]) ||
      !Number.isFinite(item.transform[5])
    )
      continue;
    const y = item.transform[5],
      x = item.transform[4];
    let band = bands.find((b) => Math.abs(b.y - y) <= 2.5);
    if (!band) {
      band = { y, items: [] };
      bands.push(band);
    }
    band.items.push({ x, text: item.str });
  }
  return bands
    .sort((a, b) => b.y - a.y)
    .map((b) => ({
      page,
      text: clean(
        b.items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.text)
          .join(' '),
      ),
    }))
    .filter((l) => l.text);
}
export function adaptPdf(
  lines: PdfLine[],
  account: Account,
  pages: number,
  parserVersion: string,
): PdfStatement {
  if (lines.length > PDF_LIMITS.lines) throw new Error('text-limit');
  const all = lines.map((l) => l.text).join('\n');
  const detected: Account[] = [];
  if (/american\s*express|americanexpress|\bamex\b/i.test(all))
    detected.push('Amex');
  if (/capital\s*one|capitalone/i.test(all)) detected.push('Capital One');
  if (/bank\s*of\s*america|bankofamerica/i.test(all))
    detected.push('Bank of America');
  // Payment descriptions may name another bank. Identity evidence is limited to page one.
  const first = lines
    .filter((l) => l.page === 1)
    .map((l) => l.text)
    .join('\n');
  const selectedBrand =
    account === 'Amex'
      ? /american\s*express|americanexpress|\bamex\b/i
      : account === 'Capital One'
        ? /capital\s*one|capitalone/i
        : /bank\s*of\s*america|bankofamerica/i;
  if (detected.length && !selectedBrand.test(first))
    throw new Error('bank-mismatch');
  const kind =
    /deposits? and other additions|withdrawals? and other subtractions|checking (?:account|statement)|savings statement/i.test(
      all,
    )
      ? 'deposit'
      : 'card';
  let cycleThrough: string | undefined, cycleFrom: string | undefined;
  for (const line of lines.slice(0, 150)) {
    if (
      !/closing date|statement (?:period|date)|billing period|account summary.*through|through\s/i.test(
        line.text,
      )
    )
      continue;
    const tokens = [...line.text.matchAll(DATE)].map((m) => m[0]);
    const dates = tokens.map((t) => pdfDate(t)).filter(Boolean);
    if (dates.length) {
      cycleThrough = dates.at(-1);
      if (dates.length > 1) cycleFrom = dates[0];
    }
  }
  const rows: PdfRow[] = [],
    totals: PdfStatement['totals'] = [];
  let section: PdfGroup = 'unknown',
    summaryGroup: PdfGroup | undefined,
    inSummary = false,
    explicitPosted = false,
    twoDates = false,
    postedFirst = false,
    ambiguous = false;
  for (const line of lines) {
    const text = clean(line.text);
    if (
      /\bpost(?:ed|ing)?\s*date\b/i.test(text) &&
      /description|amount|transaction|purchase|trans\.?\s*date/i.test(text) &&
      text.length < 150
    ) {
      explicitPosted = true;
      twoDates = /transaction|purchase|trans\.? date/i.test(text);
      const postedIndex = text.search(/post(?:ed|ing)?\s*date/i),
        purchaseIndex = text.search(/transaction|purchase|trans\.? date/i);
      postedFirst = twoDates && postedIndex < purchaseIndex;
    }
    if (
      /year.to.date|totals? for (?:this|the) year|annual percentage|interest charge calculation|rewards summary|minimum payment|payment due date/i.test(
        text,
      )
    ) {
      inSummary = false;
      summaryGroup = undefined;
      section = 'unknown';
      continue;
    }
    const dates = [...text.matchAll(DATE)];
    const amounts = [...text.matchAll(AMOUNT)];
    const leadingDate = dates.length && dates[0].index! <= 3;
    if (leadingDate && amounts.length) {
      const lastAmount = amounts.at(-1)!;
      const lastDate =
        dates.length > 1 && dates[1].index! < 25 ? dates[1] : dates[0];
      const start = lastDate.index! + lastDate[0].length,
        end = lastAmount.index!;
      const merchant = safeMerchant(
        text.slice(start, end).replace(/^\s*\*?\s*/, ''),
      );
      if (!merchant || end <= start || amounts.length > 1) {
        ambiguous = true;
        continue;
      }
      const postedToken = twoDates && postedFirst ? dates[0] : lastDate;
      const purchaseToken = postedToken === dates[0] ? lastDate : dates[0];
      const date = pdfDate(postedToken[0], cycleThrough);
      rows.push({
        id: `p${line.page}-r${rows.length + 1}`,
        page: line.page,
        date,
        purchaseDate:
          twoDates && lastDate !== dates[0]
            ? pdfDate(purchaseToken[0], cycleThrough) || undefined
            : undefined,
        merchant,
        amountCents: pdfAmount(lastAmount[0]),
        group: section,
        type: rowType(section),
        dateUncertain:
          !explicitPosted || !date || !dateParts(postedToken[0])?.year,
        pending: /\bpending\b|authorization only/i.test(text),
      });
      if (rows.length > PDF_LIMITS.rows) throw new Error('text-limit');
      continue;
    }
    if (leadingDate && !amounts.length) {
      ambiguous = true;
      continue;
    }
    const group = groupFor(text);
    const isTotal =
      /^total\b/i.test(text) || /\bsummary\b|account summary/i.test(text);
    if (group && !amounts.length && text.length < 120) {
      section = group;
      summaryGroup = group;
    }
    if (/^summary\b|account summary/i.test(text)) inSummary = true;
    if (
      /^detail\b|transaction details|account activity|transaction activity/i.test(
        text,
      )
    )
      inSummary = false;
    if (
      amounts.length === 1 &&
      !/year|apr|rate|balance|due|available|limit|minimum/i.test(text)
    ) {
      const amount = pdfAmount(amounts[0][0]);
      const target = group ?? (inSummary ? summaryGroup : undefined);
      if (target && (isTotal || group || inSummary)) {
        totals.push({ group: target, cents: amount, page: line.page });
        if (totals.length > 100) throw new Error('text-limit');
      }
    }
  }
  const warnings: PdfStatement['warnings'] = [];
  if (rows.some((r) => r.dateUncertain)) warnings.push('dates');
  if (rows.some((r) => r.group === 'unknown'))
    warnings.push('unknown-sections');
  if (!cycleThrough) warnings.push('no-cycle');
  if (ambiguous) warnings.push('ambiguous-rows');
  const grouped = new Map<PdfGroup, Set<number>>();
  for (const t of totals) {
    const set = grouped.get(t.group) ?? new Set<number>();
    set.add(t.cents);
    grouped.set(t.group, set);
  }
  if ([...grouped.values()].some((s) => s.size > 1))
    warnings.push('inconsistent-totals');
  // Real Capital One / BofA layouts have not yet been supplied; never claim validation.
  if (account !== 'Amex' || !selectedBrand.test(first))
    warnings.push('layout-unvalidated');
  if (!rows.length || totals.length < (kind === 'card' ? 4 : 3))
    warnings.push('missing-totals');
  return {
    account,
    pages,
    parserVersion,
    kind,
    rows,
    totals,
    warnings,
    cycleFrom,
    cycleThrough,
  };
}
