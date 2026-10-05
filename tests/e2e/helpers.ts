import type { Page } from '@playwright/test';
// Desktop shows every view in the sidebar; phones keep Accounts, Recurring,
// and Settings in the More sheet of the bottom tab bar.
export async function openView(page: Page, name: string) {
  const direct = page.getByRole('button', { name, exact: true });
  if (!(await direct.isVisible()))
    await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('heading', { level: 1, name }).waitFor();
}
