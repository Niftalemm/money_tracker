import { expect, test } from '@playwright/test';
import { demoState } from '../../src/lib/demo';
import { money, monthTransactions, total } from '../../src/lib/accounting';
import { openView } from './helpers';
const demo = demoState();
const september = monthTransactions(demo, '2026-09');
const initial = total(september);
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T20:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with fake data' }).click();
});
test('every view is reachable without horizontal scrolling, with comfortable touch targets', async ({
  page,
}, info) => {
  for (const view of [
    'Transactions',
    'Cash flow',
    'Accounts',
    'Recurring',
    'Settings',
    'Dashboard',
  ]) {
    await openView(page, view);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${view} fits the viewport`,
    ).toBe(true);
  }
  if (info.project.name !== 'phone') return;
  const targets = page
    .locator(
      '.tabbar button, .mobile-bar button, .page-actions button, .month-switcher select',
    )
    .filter({ visible: true });
  const count = await targets.count();
  expect(count).toBeGreaterThan(8);
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    expect(box, `target ${i} is rendered`).not.toBeNull();
    expect(box!.height, `target ${i} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `target ${i} width`).toBeGreaterThanOrEqual(44);
  }
});
test('bank filter chips and account shortcuts narrow the transaction list', async ({
  page,
}) => {
  await openView(page, 'Transactions');
  const capitalOne = september.filter((t) => t.account === 'Capital One');
  await page
    .getByRole('group', { name: 'Filter account' })
    .getByRole('button', { name: 'Capital One' })
    .click();
  await expect(page.locator('.list-summary')).toContainText(
    `${capitalOne.length} transactions · ${money(total(capitalOne))} net spending`,
  );
  await expect(page.locator('.tx-row')).toHaveCount(capitalOne.length);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.tx-row')).toHaveCount(september.length);
  await openView(page, 'Accounts');
  await page.getByRole('button', { name: 'View Amex transactions' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Transactions' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Filter account' })
      .getByRole('button', { name: 'Amex' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
test('expense entry shows readable errors, then a success message', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page
    .getByLabel('Merchant or description')
    .fill('Synthetic toast check');
  await page.getByLabel('Amount (USD, positive)', { exact: true }).fill('abc');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'Amount must be a number with at most two decimal places.',
  );
  await page.getByLabel('Amount (USD, positive)', { exact: true }).fill('4.50');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.locator('.toast-region')).toContainText('Expense added');
  await expect(page.getByTestId('net-spending')).toHaveText(
    money(initial + 450),
  );
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('cash flow separates income, spending, and transfers', async ({
  page,
}) => {
  await openView(page, 'Cash flow');
  await expect(
    page.locator('.stat-card', { hasText: 'Recorded income' }),
  ).toContainText('$4,200.00');
  await expect(
    page.locator('.stat-card', { hasText: 'Net spending' }),
  ).toContainText(money(initial));
  await expect(
    page.locator('.stat-card', { hasText: 'Net cash flow' }),
  ).toContainText(`+${money(420000 - initial)}`);
});
test('category drilldown narrows to one merchant and month switching is bounded', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Groceries', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Fresh Market/ }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Fresh Market · exact transactions' }),
  ).toBeVisible();
  await expect(dialog.locator('.tx-row')).toHaveCount(
    september.filter((t) => t.merchant === 'Fresh Market').length,
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(
    page.getByRole('button', { name: 'Previous month' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByLabel('Selected month')).toHaveValue('2026-10');
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByTestId('net-spending')).toHaveText(money(initial));
});
test('Excel export is generated locally from the export dialog', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Download Excel' }).click();
  await page.getByLabel('All months').check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('money-tracker-all.xlsx');
  await expect(page.locator('.toast-region')).toContainText(
    'Excel file downloaded',
  );
});
test('an empty vault shows the getting-started checklist and empty states', async ({
  page,
}) => {
  await openView(page, 'Settings');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(page.locator('.toast-region')).toContainText('Import undone');
  await openView(page, 'Dashboard');
  await expect(
    page.getByRole('heading', { name: 'Get started' }),
  ).toBeVisible();
  await expect(page.getByTestId('net-spending')).toHaveText('$0.00');
  await expect(page.getByText('No spending recorded yet')).toBeVisible();
  await expect(
    page.getByText('0 of 3 accounts imported', { exact: false }),
  ).toBeVisible();
});
test('the font is self-hosted and bank logos render without outside requests', async ({
  page,
}) => {
  await openView(page, 'Transactions');
  await expect(
    page.getByRole('group', { name: 'Filter account' }).locator('.bank-logo'),
  ).toHaveCount(3);
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px "Plus Jakarta Sans Variable"');
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .every((e) => e.name.startsWith(location.origin)),
    ),
  ).toBe(true);
});
