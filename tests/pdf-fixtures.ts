import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Account } from '../src/lib/model';
export const brands: Record<Account, string> = {
  Amex: 'American Express',
  'Capital One': 'Capital One',
  'Bank of America': 'Bank of America',
};
export function syntheticLines(
  account: Account,
  missing = false,
  deposit = false,
) {
  return [
    brands[account],
    'Statement Period 08/25/2026 through 09/23/2026',
    ...(deposit
      ? [
          'Checking Statement',
          'Deposits and other additions',
          '09/02/2026 Synthetic salary $100.00',
          'Total deposits $100.00',
          'Withdrawals and other subtractions',
          '09/03/2026 Synthetic store $25.00',
          'Total withdrawals $25.00',
          'Checks',
          'Total checks $0.00',
        ]
      : [
          'Posted Date Description Amount',
          'New Charges',
          '08/30/2026 Synthetic August store $5.00',
          '09/02/2026 Synthetic September store $25.00',
          `Total New Charges $${missing ? '31' : '30'}.00`,
          'Payments',
          '09/05/2026 Synthetic card payment $20.00',
          'Total Payments $20.00',
          'Credits',
          '09/06/2026 Synthetic refund $2.00',
          'Total Credits $2.00',
        ]),
    'Fees',
    'Total Fees $0.00',
    'Interest Charged',
    'Total Interest Charged $0.00',
  ];
}
export async function syntheticPdf(
  account: Account,
  options: {
    script?: boolean;
    pages?: number;
    missing?: boolean;
    deposit?: boolean;
    merchant?: string;
    blank?: boolean;
  } = {},
) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < (options.pages ?? 1); i++) {
    const page = doc.addPage([612, 792]);
    if (!options.blank && i === 0)
      syntheticLines(account, options.missing, options.deposit).forEach(
        (line, n) =>
          page.drawText(
            options.merchant && line.includes('September store')
              ? line.replace('Synthetic September store', options.merchant)
              : line,
            { x: 40, y: 750 - n * 25, size: 10, font },
          ),
      );
  }
  if (options.script)
    doc.addJavaScript('untrusted', 'globalThis.pdfScriptExecuted = true;');
  return Buffer.from(await doc.save());
}
