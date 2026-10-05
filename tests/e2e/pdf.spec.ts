import { expect, test } from '@playwright/test';
import { syntheticPdf } from '../pdf-fixtures';
import { ACCOUNTS } from '../../src/lib/model';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with fake data' }).click();
  await page.getByRole('button', { name: 'Upload transactions' }).click();
});
for (const account of ACCOUNTS)
  test(`actual isolated PDF worker imports ${account} only after reconciliation`, async ({
    page,
  }) => {
    const outward: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() !== 'GET' ||
        !request.url().startsWith('http://127.0.0.1:3000')
      )
        outward.push(request.url());
    });
    await page
      .getByRole('combobox', { name: 'Account', exact: true })
      .selectOption(account);
    await page.getByLabel('Transaction file').setInputFiles({
      name: 'synthetic.pdf',
      mimeType: 'application/pdf',
      buffer: await syntheticPdf(account),
    });
    await expect(
      page.getByRole('heading', {
        name: 'Review PDF extraction and reconcile',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Continue to duplicate and category review',
      }),
    ).toBeDisabled();
    for (const label of [
      'I verified or corrected every posted date',
      'I checked all statement pages',
      'I checked payments as transfers',
    ])
      await page.getByLabel(label, { exact: false }).check();
    await page
      .getByRole('button', {
        name: 'Continue to duplicate and category review',
      })
      .click();
    await expect(
      page.getByText('PDF statement totals reconciled.', { exact: false }),
    ).toBeVisible();
    // The August row counts in August, the rest in September.
    await expect(page.getByText('excluded from tracking')).toHaveCount(0);
    await expect(page.getByText('2026-08-30', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm import' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(outward).toEqual([]);
  });
test('the actual parser safely rejects malformed, scripted, blank and excessive-page PDFs', async ({
  page,
}) => {
  for (const [buffer, message] of [
    [Buffer.from('%PDF-1.7\ncorrupted'), 'could not be read safely'],
    [await syntheticPdf('Amex', { script: true }), 'Embedded PDF scripting'],
    [await syntheticPdf('Amex', { blank: true }), 'no readable text'],
    [await syntheticPdf('Amex', { pages: 41 }), 'at most 40 pages'],
  ] as const) {
    await page.getByLabel('Transaction file').setInputFiles({
      name: 'synthetic-untrusted.pdf',
      mimeType: 'application/pdf',
      buffer,
    });
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      message,
    );
    await expect(
      page.getByRole('button', { name: 'Confirm import' }),
    ).toHaveCount(0);
  }
  expect(
    await page.evaluate(() => Object.hasOwn(globalThis, 'pdfScriptExecuted')),
  ).toBe(false);
});
test('a missing row blocks reconciliation and malicious merchant markup stays text', async ({
  page,
}) => {
  const merchant = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Transaction file').setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: await syntheticPdf('Amex', { missing: true, merchant }),
  });
  await expect(
    page.getByRole('heading', { name: 'Review PDF extraction and reconcile' }),
  ).toBeVisible();
  for (const label of [
    'I verified or corrected every posted date',
    'I checked all statement pages',
    'I checked payments as transfers',
  ])
    await page.getByLabel(label, { exact: false }).check();
  await expect(
    page.getByRole('button', {
      name: 'Continue to duplicate and category review',
    }),
  ).toBeDisabled();
  await page
    .getByLabel('Statement total purchases', { exact: true })
    .fill('30.00');
  await page
    .getByLabel('I checked all statement pages', { exact: false })
    .check();
  await page
    .getByRole('button', { name: 'Continue to duplicate and category review' })
    .click();
  await expect(page.getByText(merchant, { exact: true })).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});
test('the deployed worker blocks network access and resumed expired tabs lock on first activity', async ({
  page,
}) => {
  const response = await page.request.get('/pdf-import.worker.mjs');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain(
    "connect-src 'none'",
  );
  const document = await page.request.get('/');
  expect(document.headers()['content-security-policy']).toContain(
    "worker-src 'self'",
  );
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 600_001));
  await page.mouse.click(5, 5);
  await expect(
    page.getByRole('heading', { name: 'Welcome to your tracker' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Bank of America deposit PDF reconciles additions, withdrawals, checks, and fees', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('Bank of America');
  await page.getByLabel('Transaction file').setInputFiles({
    name: 'synthetic-bofa-deposit.pdf',
    mimeType: 'application/pdf',
    buffer: await syntheticPdf('Bank of America', { deposit: true }),
  });
  await expect(
    page.getByRole('heading', { name: 'Review PDF extraction and reconcile' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Statement total deposits', { exact: true }),
  ).toHaveValue('100.00');
  for (const label of [
    'I verified or corrected every posted date',
    'I checked all statement pages',
    'I checked payments as transfers',
  ])
    await page.getByLabel(label, { exact: false }).check();
  await page
    .getByRole('button', { name: 'Continue to duplicate and category review' })
    .click();
  await expect(page.getByLabel('Type row 2')).toHaveValue('income');
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('several statements at once: balanced ones import together, problems are set aside', async ({
  page,
}) => {
  const outwardRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' ||
      !request.url().startsWith('http://127.0.0.1:3000')
    )
      outwardRequests.push(request.url());
  });
  // Synthetic Amex statements for consecutive billing periods.
  const amex = (closing: string, rows: string[], total: string) =>
    syntheticPdf('Amex', {
      lines: [
        'American Express',
        `Closing Date ${closing}`,
        'Days in Billing Period: 30',
        'Payments and Credits',
        'Summary',
        'Payments $0.00',
        'Credits $0.00',
        'New Charges',
        'Summary',
        `Total New Charges ${total}`,
        'Detail',
        ...rows,
        'Fees',
        'Total Fees for this Period $0.00',
        'Interest Charged',
        'Total Interest Charged for this Period $0.00',
      ],
    });
  const july = await amex(
      '07/24/26',
      ['06/28/26 SYNTHETIC GROCER $42.00', '07/10/26 SYNTHETIC CAFE $6.50'],
      '$48.50',
    ),
    august = await amex(
      '08/24/26',
      ['07/30/26 SYNTHETIC BOOKS $18.00', '08/12/26 SYNTHETIC CAFE $6.50'],
      '$24.50',
    ),
    off = await amex('06/24/26', ['06/01/26 SYNTHETIC SHOP $5.00'], '$9.00');
  const file = (name: string, buffer: Buffer) => ({
    name,
    mimeType: 'application/pdf',
    buffer,
  });
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('Amex');
  await page
    .getByLabel('Transaction file')
    .setInputFiles([
      file('july.pdf', july),
      file('august.pdf', august),
      file('july-again.pdf', july),
      file('june.pdf', off),
    ]);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('4 statements read')).toBeVisible({
    timeout: 30_000,
  });
  await expect(dialog.getByText('Balances')).toHaveCount(2);
  await expect(dialog.getByText('Duplicate', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Needs review', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Doesn't balance yet/)).toBeVisible();
  const go = page.getByRole('button', { name: 'Continue with 2 statements' });
  await expect(go).toBeDisabled();
  for (const label of [
    'I checked posted dates',
    'Each file is a complete statement',
    'Card payments are marked as transfers',
  ])
    await page.getByLabel(label, { exact: false }).check();
  await go.click();
  await expect(
    page.getByText('No possible duplicates. Every transaction is new.'),
  ).toBeVisible();
  await page
    .getByLabel('These statements include every posted transaction', {
      exact: false,
    })
    .check();
  await page.getByRole('button', { name: 'Import 2 statements' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText('2 Amex statements imported · 4 added'),
  ).toBeVisible();
  // Each purchase lands in its own calendar month.
  await page.getByLabel('Selected month').selectOption('2026-07');
  await expect(page.getByTestId('net-spending')).toHaveText('$24.50');
  expect(outwardRequests).toEqual([]);
});
