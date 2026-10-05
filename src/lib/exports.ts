import {
  net,
  total,
  trackedMonths,
  monthTransactions,
  accountCoverage,
  comparison,
  money,
  firstMonth,
} from './accounting';
import { ACCOUNTS, type TrackerState } from './model';
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function excelBuffer(s: TrackerState, month?: string) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  const tx = book.addWorksheet('Transactions');
  tx.addRow([
    'Posted date',
    'Purchase date',
    'Merchant',
    'Amount USD',
    'Net spending USD',
    'Account alias',
    'Category',
    'Type',
    'Inclusion status',
    'Reimbursement USD',
    'Notes',
  ]);
  const list = month ? monthTransactions(s, month) : s.transactions;
  list
    .sort((a, b) => a.postedDate.localeCompare(b.postedDate))
    .forEach((t) =>
      tx.addRow([
        t.postedDate,
        t.purchaseDate ?? '',
        t.merchant,
        t.amountCents / 100,
        net(t) / 100,
        t.account,
        t.category,
        t.type,
        t.reimbursementFor
          ? 'Excluded: matched reimbursement'
          : t.type === 'transfer' || t.type === 'income'
            ? 'Excluded'
            : 'Included',
        t.reimbursementCents / 100,
        t.notes,
      ]),
    );
  const summary = book.addWorksheet('Monthly summary');
  summary.addRow([
    'Month',
    'Net spending USD',
    'Previous comparable USD',
    'Dollar change USD',
    'Percentage change',
    'Comparison days',
    'Coverage',
    'Amex covered days',
    'Bank of America covered days',
    'Capital One covered days',
  ]);
  const months = month
    ? [month]
    : trackedMonths(
        s.transactions
          .map((t) => t.postedDate.slice(0, 7))
          .sort()
          .at(-1),
        firstMonth(s),
      );
  months.forEach((m) => {
    const comp = comparison(s, m),
      cover = ACCOUNTS.map((a) => accountCoverage(s, a, m));
    summary.addRow([
      m,
      total(monthTransactions(s, m)) / 100,
      comp.available ? comp.previous / 100 : '',
      comp.available ? comp.dollars / 100 : '',
      comp.available && comp.percent !== null ? comp.percent / 100 : '',
      comp.days,
      cover.every((c) => c.complete)
        ? 'Complete through comparison date'
        : 'Partial',
      ...cover.map((c) => c.covered),
    ]);
  });
  for (const sheet of [tx, summary]) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF164F45' },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((c) => {
      c.width = 24;
    });
  }
  // Strings stay literal string cells, including text beginning with =, +, -, or @.
  tx.getColumn(4).numFmt =
    tx.getColumn(5).numFmt =
    tx.getColumn(10).numFmt =
      '$#,##0.00;[Red]($#,##0.00)';
  summary.getColumn(2).numFmt =
    summary.getColumn(3).numFmt =
    summary.getColumn(4).numFmt =
      '$#,##0.00;[Red]($#,##0.00)';
  summary.getColumn(5).numFmt = '0.0%';
  return book.xlsx.writeBuffer();
}
export async function exportExcel(s: TrackerState, month?: string) {
  const buffer = await excelBuffer(s, month);
  download(
    new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `money-tracker-${month ?? 'all'}.xlsx`,
  );
}
