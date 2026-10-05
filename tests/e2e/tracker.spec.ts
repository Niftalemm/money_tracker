import { expect, test } from '@playwright/test';
import { openView } from './helpers';
import { demoState } from '../../src/lib/demo';
import { money, monthTransactions, total } from '../../src/lib/accounting';
const initial = total(monthTransactions(demoState(), '2026-09'));
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T20:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with fake data' }).click();
});
test('September dashboard has all banks, exact drilldowns, and monthly comparisons', async ({
  page,
}) => {
  await expect(page.getByTestId('net-spending')).toHaveText(money(initial));
  for (const account of ['Amex', 'Bank of America', 'Capital One'])
    await expect(
      page.getByRole('heading', { name: account, exact: true }),
    ).toBeVisible();
  await page.getByRole('button', { name: 'Groceries', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('heading', { name: 'All merchants · exact transactions' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Selected month').selectOption('2026-10');
  await expect(page.getByText('Early estimate', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Comparison uses equal elapsed days/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download Excel' }),
  ).toBeVisible();
});
test('manual entry and confirmed deletion update accounting', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page
    .getByLabel('Merchant or description')
    .fill('Synthetic test purchase');
  await page
    .getByLabel('Amount (USD, positive)', { exact: true })
    .fill('10.25');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByTestId('net-spending')).toHaveText(
    money(initial + 1025),
  );
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByLabel('Search merchants').fill('Synthetic test purchase');
  await page
    .getByRole('button', { name: 'Edit Synthetic test purchase', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByText('No transactions here yet.')).toBeVisible();
});
test('imports require mapping and confirmation; payment correction and undo preserve totals', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Upload transactions' }).click();
  await page.getByLabel('Transaction file').setInputFiles({
    name: 'synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Date,Description,Amount,Status\n2026-09-10,Synthetic CSV shop,25.00,Posted\n2026-09-11,Synthetic card payment,25.00,Posted\n2026-09-12,Synthetic pending,8.00,Pending',
    ),
  });
  await page.getByLabel('Posted date', { exact: true }).selectOption('Date');
  await page
    .getByLabel('Description / merchant', { exact: true })
    .selectOption('Description');
  await page.getByLabel('Amount', { exact: true }).selectOption('Amount');
  await page.getByLabel('Pending / posted status').selectOption('Status');
  await page.getByLabel('I checked my export').check();
  await page.getByRole('button', { name: 'Review 3 rows' }).click();
  await page.getByLabel('Type row 3').selectOption('transfer');
  await expect(page.getByTestId('net-spending')).toHaveText(money(initial));
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByTestId('net-spending')).toHaveText(
    money(initial + 2500),
  );
  await openView(page, 'Settings');
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm undo' }).click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByTestId('net-spending')).toHaveText(money(initial));
});
test('phone layout fits the viewport and locking drops demo changes', async ({
  page,
}) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to your tracker' }),
  ).toBeVisible();
});

test('production headers and memory-only storage protect the workspace', async ({
  page,
}) => {
  const response = await page.request.get('/');
  const headers = response.headers();
  const csp = headers['content-security-policy'];
  expect(csp).toContain("script-src 'self' 'nonce-");
  expect(csp).toContain("frame-ancestors 'none'");
  if (process.env.E2E_PRODUCTION) expect(csp).not.toContain('unsafe-eval');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['cache-control']).toContain('no-store');
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
});

test('ten minutes of inactivity clears the unlocked workspace', async ({
  page,
}) => {
  await page.clock.fastForward(600_001);
  await expect(
    page.getByRole('heading', { name: 'Welcome to your tracker' }),
  ).toBeVisible();
  await expect(page.getByTestId('net-spending')).toHaveCount(0);
});
test('a purchase you entered is matched to its later statement line instead of counting twice', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Merchant or description').fill('Starbucks');
  await page.getByLabel('Amount (USD, positive)', { exact: true }).fill('6.50');
  await page.getByLabel('Posted date', { exact: true }).fill('2026-09-05');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByTestId('net-spending')).toHaveText(
    money(initial + 650),
  );
  await page.getByRole('button', { name: 'Upload transactions' }).click();
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption('Amex');
  await page.getByLabel('Transaction file').setInputFiles({
    name: 'synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Date,Description,Amount\n2026-09-07,STARBUCKS STORE 12345 NEW YORK NY,6.50',
    ),
  });
  await page.getByLabel('Posted date', { exact: true }).selectOption('Date');
  await page
    .getByLabel('Description / merchant', { exact: true })
    .selectOption('Description');
  await page.getByLabel('Amount', { exact: true }).selectOption('Amount');
  await page.getByLabel('I checked my export').check();
  await page.getByRole('button', { name: 'Review 1 row' }).click();
  await expect(
    page.getByText('Looks like your entry "Starbucks" on Sat, Sep 5'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm import' }),
  ).toBeDisabled();
  await page.getByLabel('Action row 2').selectOption('link');
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByTestId('net-spending')).toHaveText(
    money(initial + 650),
  );
});
test('coverage dates come from the file, and a file from before tracking says so', async ({
  page,
}) => {
  const upload = async (csv: string) => {
    await page.getByRole('button', { name: 'Upload transactions' }).click();
    await page.getByLabel('Transaction file').setInputFiles({
      name: 'synthetic.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await page.getByLabel('Posted date', { exact: true }).selectOption('Date');
    await page
      .getByLabel('Description / merchant', { exact: true })
      .selectOption('Description');
    await page.getByLabel('Amount', { exact: true }).selectOption('Amount');
    await page.getByLabel('I checked my export').check();
    await page.getByRole('button', { name: /^Review \d+ rows?$/ }).click();
  };
  await upload(
    'Date,Description,Amount\n2026-09-03,Synthetic shop,5.00\n2026-09-12,Synthetic cafe,4.00',
  );
  await expect(page.getByLabel('Covered from')).toHaveValue('2026-09-03');
  await expect(page.getByLabel('Covered through')).toHaveValue('2026-09-12');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await upload(
    'Date,Description,Amount\n2026-05-28,Synthetic shop,5.00\n2026-06-20,Synthetic cafe,4.00',
  );
  await expect(
    page.getByText(
      'Tracking starts September 1, 2026, so nothing from it is added.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Covered from')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Confirm import' }),
  ).toBeDisabled();
});
