import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { excelBuffer } from '../src/lib/exports';
import { demoState } from '../src/lib/demo';
import { total, monthTransactions } from '../src/lib/accounting';
it('Excel totals agree with dashboard and imported formula-like text stays literal', async () => {
  const state = demoState();
  state.transactions[0].merchant = '=HYPERLINK("https://invalid.example")';
  state.transactions[0].notes = '+1+1';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await excelBuffer(state, '2026-09'));
  const tx = workbook.getWorksheet('Transactions')!,
    summary = workbook.getWorksheet('Monthly summary')!;
  expect(tx.getCell('C2').type).toBe(ExcelJS.ValueType.String);
  expect(tx.getCell('C2').text).toBe(state.transactions[0].merchant);
  let cents = 0;
  tx.eachRow((row, i) => {
    if (i > 1) cents += Math.round(Number(row.getCell(5).value) * 100);
  });
  expect(cents).toBe(total(monthTransactions(state, '2026-09')));
  expect(summary.getCell('B2').value).toBe(cents / 100);
  expect(tx.rowCount).toBe(monthTransactions(state, '2026-09').length + 1);
});
