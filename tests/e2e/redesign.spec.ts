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
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('main *')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .filter((el) =>
            ['auto', 'scroll'].includes(getComputedStyle(el).overflowX),
          )
          .map((el) => el.className),
      ),
      `${view} has no sideways-scrolling boxes`,
    ).toEqual([]);
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
  await expect(
    page
      .getByRole('button', { name: 'Edit Netflix' })
      .locator('.merchant-icon.brand'),
  ).toHaveAttribute('title', 'Netflix');
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return (
        document.fonts.check('16px "Inter Variable"') &&
        document.fonts.check('32px "Source Serif 4 Variable"')
      );
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
test('cash flow diagram balances and opens category details', async ({
  page,
}) => {
  await openView(page, 'Cash flow');
  const diagram = page.getByRole('img', { name: /Cash flow for the month/ });
  await expect(diagram).toBeVisible();
  await expect(diagram).toHaveAttribute('aria-label', /Left over/);
  await page.getByRole('button', { name: /^Housing, \$1,600\.00/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', {
      name: 'All merchants · exact transactions',
    }),
  ).toBeVisible();
});
test('dark mode follows the device, can be overridden, and never touches browser storage', async ({
  page,
}) => {
  const isDark = () =>
    page.evaluate(
      () =>
        getComputedStyle(document.body).backgroundColor === 'rgb(18, 18, 17)',
    );
  expect(await isDark()).toBe(false);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await isDark()).toBe(true);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await isDark()).toBe(true);
  await openView(page, 'Settings');
  await expect(page.getByLabel('Dark', { exact: true })).toBeChecked();
  await page.locator('.segmented label', { hasText: 'System' }).click();
  await expect(page.getByLabel('System', { exact: true })).toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});
test('the top bar hides while scrolling down and returns when scrolling up', async ({
  page,
}) => {
  await openView(page, 'Transactions');
  const bar = page.locator('.topbar');
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() => bar.evaluate((e) => e.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(0);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(() => bar.evaluate((e) => e.getBoundingClientRect().top))
    .toBe(0);
});
test('detail sheets show their transactions, and taps leave no focus ring', async ({
  page,
}, info) => {
  await openView(page, 'Cash flow');
  await page.getByRole('button', { name: /^Transit, / }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'All merchants · exact transactions' }),
  ).toBeInViewport();
  await expect(dialog.getByText('Metro pass').last()).toBeInViewport();
  if (info.project.name === 'phone')
    // Full sheet: it reaches the top of the screen.
    expect((await dialog.boundingBox())!.y).toBeLessThan(40);
  const outline = () =>
    page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(await outline()).toBe('none');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toHaveCount(0);
  // Keyboard users still see where focus is.
  await page.keyboard.press('Tab');
  expect(await outline()).toBe('solid');
});
test('the purple logo is the tab and home-screen icon in every browser', async ({
  page,
  request,
}) => {
  for (const [rel, type] of [
    ['icon', 'image/x-icon'],
    ['icon', 'image/svg+xml'],
    ['apple-touch-icon', 'image/png'],
  ]) {
    const href = await page
      .locator(`link[rel="${rel}"][type="${type}"]`)
      .getAttribute('href');
    const response = await request.get(href!);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe(type);
  }
});
