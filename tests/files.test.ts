import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readImport } from '../src/lib/imports';
describe('on-device file parsing', () => {
  it('reads quoted CSV fields and rejects mismatched row widths', async () => {
    const file = new File(
      ['Date,Description,Amount\n2026-09-01,"Synthetic, shop",12.34'],
      'fake.csv',
    );
    expect((await readImport(file)).rows[0].Description).toBe(
      'Synthetic, shop',
    );
    await expect(
      readImport(
        new File(['Date,Description,Amount\n2026-09-01,Shop'], 'fake.csv'),
      ),
    ).rejects.toThrow('number of columns');
  });
  it('reads XLSX dates and values locally and rejects formulas', async () => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Transactions');
    sheet.addRow(['Date', 'Description', 'Amount']);
    sheet.addRow([new Date('2026-09-03T00:00:00Z'), 'Synthetic shop', 12.34]);
    const file = new File(
      [(await book.xlsx.writeBuffer()) as BlobPart],
      'fake.xlsx',
    );
    expect((await readImport(file)).rows[0]).toEqual({
      Date: '2026-09-03',
      Description: 'Synthetic shop',
      Amount: '12.34',
    });
    sheet.getCell('C2').value = { formula: '1+1', result: 2 };
    await expect(
      readImport(
        new File([(await book.xlsx.writeBuffer()) as BlobPart], 'fake.xlsx'),
      ),
    ).rejects.toThrow('formulas');
  });
  it('rejects macro content even if renamed to XLSX', async () => {
    const archive = new JSZip();
    archive.file('xl/workbook.xml', '<fake />');
    archive.file('xl/vbaProject.bin', 'fake macro');
    await expect(
      readImport(
        new File(
          [(await archive.generateAsync({ type: 'uint8array' })) as BlobPart],
          'renamed.xlsx',
        ),
      ),
    ).rejects.toThrow('Macro content');
  });
  it('rejects excessive expanded ZIP sizes before loading a workbook', async () => {
    const archive = new JSZip();
    archive.file('xl/workbook.xml', '<fake />');
    archive.file('[Content_Types].xml', '<fake />');
    const bytes = await archive.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    });
    const buffer = Buffer.from(bytes),
      signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    let index = buffer.indexOf(signature);
    while (
      index >= 0 &&
      buffer
        .subarray(index + 46, index + 46 + buffer.readUInt16LE(index + 28))
        .toString() !== 'xl/workbook.xml'
    )
      index = buffer.indexOf(signature, index + 4);
    expect(index).toBeGreaterThanOrEqual(0);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
      index + 24,
      60 * 1024 * 1024,
      true,
    );
    await expect(
      readImport(new File([bytes as BlobPart], 'synthetic-large.xlsx')),
    ).rejects.toThrow('Expanded workbook');
  });
});
