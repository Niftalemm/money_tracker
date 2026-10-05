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
  if (/atm and debit card|debit card (?:subtractions|purchases)/.test(value))
    return 'debit-card';
  if (
    /withdrawals?(?: and other subtractions)?|other subtractions|electronic withdrawals|debits and withdrawals/.test(
      value,
    )
  )
    return 'withdrawals';
  if (/\bchecks(?: paid)?\b/.test(value)) return 'checks';
  if (/interest charged?|interest charges|total interest/.test(value))
    return 'interest';
  if (/\b(?:service )?fees(?: charged| for this period)?\b/.test(value))
    return 'fees';
  if (
    /new charges|purchases(?: and adjustments)?|transactions(?: total)?/.test(
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
  // Prefer an explicit range ("Aug 10, 2026 - Sep 08, 2026", "August 15, 2026 to
  // September 15, 2026"); single dates near "closing date" can be due dates.
  for (const line of lines.slice(0, 150)) {
    const tokens = [...line.text.matchAll(DATE)];
    for (let i = 0; i + 1 < tokens.length; i++) {
      const between = line.text.slice(
        tokens[i].index! + tokens[i][0].length,
        tokens[i + 1].index,
      );
      const from = pdfDate(tokens[i][0]),
        through = pdfDate(tokens[i + 1][0]);
      if (
        /^\s*(?:-|–|to|through)\s*$/i.test(between) &&
        from &&
        through &&
        from < through
      ) {
        cycleFrom = from;
        cycleThrough = through;
        break;
      }
    }
    if (cycleThrough) break;
  }
  for (const line of cycleThrough ? [] : lines.slice(0, 150)) {
    if (/\bdue\b|upcoming|next statement/i.test(line.text)) continue;
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
  // Amex gives only a closing date plus "Days in Billing Period: 30".
  if (cycleThrough && !cycleFrom) {
    const days = lines
      .map((l) =>
        /days in billing (?:period|cycle):?\s*(\d{1,2})\b/i.exec(l.text),
      )
      .find(Boolean);
    if (days && +days[1] >= 20 && +days[1] <= 35) {
      const start = new Date(cycleThrough + 'T12:00:00Z');
      start.setUTCDate(start.getUTCDate() - (+days[1] - 1));
      cycleFrom = start.toISOString().slice(0, 10);
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
    singleDate = false,
    starPosted = false,
    tableSeen = false,
    yearToDate = false,
    ambiguous = false;
  for (const line of lines) {
    const text = clean(line.text);
    if (
      /\bpost(?:ed|ing)?\s*date\b/i.test(text) &&
      /description|amount|transaction|purchase|trans\.?\s*date/i.test(text) &&
      text.length < 150
    ) {
      explicitPosted = true;
      tableSeen = true;
      singleDate = false;
      twoDates = /transaction|purchase|trans\.? date/i.test(text);
      const postedIndex = text.search(/post(?:ed|ing)?\s*date/i),
        purchaseIndex = text.search(/transaction|purchase|trans\.? date/i);
      postedFirst = twoDates && postedIndex < purchaseIndex;
    }
    // A single "Date" column. Deposit ledgers list the posting date there.
    if (/^date\s+description\b/i.test(text) && text.length < 60) {
      tableSeen = true;
      singleDate = true;
      twoDates = false;
      if (kind === 'deposit') explicitPosted = true;
    }
    if (/indicates posting date/i.test(text)) {
      starPosted = true;
      tableSeen = true;
    }
    if (/year.to.date|totals? for (?:this|the) year/i.test(text)) {
      yearToDate = true;
      inSummary = false;
      summaryGroup = undefined;
      section = 'unknown';
      continue;
    }
    if (
      /annual percentage|interest charge calculation|rewards summary|minimum payment|payment due date/i.test(
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
    // A row starts with its date: not "p. 7/7", and not a sentence ("10/08/26.").
    const leadingDate =
      dates.length > 0 &&
      /^[^A-Za-z0-9]{0,3}$/.test(text.slice(0, dates[0].index)) &&
      !/^[.,]/.test(text.slice(dates[0].index! + dates[0][0].length));
    // Summary/coupon text before any transaction table is never a row, but it
    // can still carry a section total ("... Payments - $41.00").
    const rowCandidate = leadingDate && (section !== 'unknown' || tableSeen);
    if (rowCandidate && amounts.length) {
      const lastAmount = amounts.at(-1)!;
      const lastDate =
        !singleDate && dates.length > 1 && dates[1].index! < 25
          ? dates[1]
          : dates[0];
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
      const starred =
        starPosted && text[postedToken.index! + postedToken[0].length] === '*';
      const inCycle =
        !!date &&
        !!cycleFrom &&
        !!cycleThrough &&
        date >= cycleFrom &&
        date <= cycleThrough;
      const type =
        section === 'payments-and-credits' &&
        /\b(?:autopay|payment|pymt|thank you)\b/i.test(merchant)
          ? 'transfer'
          : rowType(section);
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
        type,
        dateUncertain: starred
          ? !date
          : !explicitPosted ||
            !date ||
            (!dateParts(postedToken[0])?.year && !inCycle),
        pending: /\bpending\b|authorization only/i.test(text),
      });
      if (rows.length > PDF_LIMITS.rows) throw new Error('text-limit');
      continue;
    }
    if (rowCandidate && !amounts.length) {
      // A repeated page header ("Aug 10, 2026 - Sep 08, 2026") is not a row.
      if (pdfDate(dates[0][0]) !== cycleFrom) ambiguous = true;
      continue;
    }
    const group = groupFor(text);
    const isTotal =
      /^total\b/i.test(text) || /\bsummary\b|account summary/i.test(text);
    if (group && !amounts.length && text.length < 70 && !/\.$/.test(text)) {
      section = group;
      summaryGroup = group;
      yearToDate = false;
    }
    // Itemized interest/fee lines have no date; they post on the closing date.
    if (
      (section === 'interest' || section === 'fees') &&
      amounts.length === 1 &&
      !dates.length &&
      !isTotal &&
      !yearToDate &&
      /^(?:interest charge on|[a-z ]*fee\b)/i.test(text)
    ) {
      const cents = pdfAmount(amounts[0][0]);
      if (cents > 0)
        rows.push({
          id: `p${line.page}-r${rows.length + 1}`,
          page: line.page,
          date: cycleThrough ?? '',
          merchant: safeMerchant(text.slice(0, amounts[0].index)),
          amountCents: cents,
          group: section,
          type: 'purchase',
          dateUncertain: !cycleThrough,
          pending: false,
        });
      continue;
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
      !yearToDate &&
      // A total ends with its amount; terms text that merely mentions one does not.
      !text.slice(amounts[0].index! + amounts[0][0].length).trim() &&
      !/year|apr|rate|balance|due|available|limit|minimum|\bwill\b|\bin 20\d\d\b/i.test(
        text,
      )
    ) {
      const amount = pdfAmount(amounts[0][0]);
      const target = group ?? (inSummary ? summaryGroup : undefined);
      if (target && (isTotal || group || inSummary)) {
        totals.push({ group: target, cents: amount, page: line.page });
        if (totals.length > 100) throw new Error('text-limit');
      }
    }
  }
  // Nothing posts outside its statement period. Amex lists credits (fraud
  // credits, refunds) under the original purchase date, sometimes months
  // earlier; keep that as the purchase date and post the row in the period.
  if (cycleFrom && cycleThrough)
    for (const row of rows)
      if (row.date && (row.date < cycleFrom || row.date > cycleThrough)) {
        row.purchaseDate ??= row.date;
        row.date = row.date < cycleFrom ? cycleFrom : cycleThrough;
        row.dateUncertain = true;
      }
  // Capital One lists payments and credits separately in its summary but in one
  // detail section; their sum is the statement's own combined total.
  const single = (group: PdfGroup) => {
    const values = [
      ...new Set(totals.filter((t) => t.group === group).map((t) => t.cents)),
    ];
    return values.length === 1 ? values[0] : undefined;
  };
  if (
    rows.some((r) => r.group === 'payments-and-credits') &&
    !totals.some((t) => t.group === 'payments-and-credits')
  ) {
    const payments = single('payments'),
      credits = single('credits');
    if (payments !== undefined && credits !== undefined)
      totals.push({
        group: 'payments-and-credits',
        cents: payments + credits,
        page: 1,
      });
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
  // Profiles were checked locally against one real statement per bank (see
  // docs/STATEMENT_LAYOUTS.md); an unrecognized first page is still unvalidated.
  if (!selectedBrand.test(first)) warnings.push('layout-unvalidated');
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
