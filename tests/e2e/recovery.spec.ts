import { expect, test } from '@playwright/test';
import { createVault } from '../../src/lib/crypto';
import { demoState } from '../../src/lib/demo';
import { money, monthTransactions, total } from '../../src/lib/accounting';
const pass = 'synthetic browser backup unlock secret';
test('encrypted backup verifies and restores in the browser with offline recovery; changed inputs invalidate verification', async ({
  page,
}) => {
  const state = demoState();
  state.transactions[0].merchant = 'Synthetic restored merchant';
  state.preferences.weeklyAmex = true;
  const { envelope, recovery } = await createVault(pass, state);
  const outward: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' || !r.url().startsWith('http://127.0.0.1:3000'))
      outward.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with fake data' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Verify / restore backup' }).click();
  const file = page.getByLabel('Encrypted backup file');
  const secret = page.getByLabel('Backup unlock secret / recovery key');
  const verify = page.getByRole('button', { name: 'Decrypt & verify locally' });
  await file.setInputFiles({
    name: 'synthetic-encrypted-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  await secret.fill('synthetic recovered login password');
  await verify.click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Backup verification failed',
  );
  await secret.fill(pass);
  await verify.click();
  await expect(page.getByText(/Verified: .*transactions/)).toBeVisible();
  await secret.fill('changed input');
  await expect(
    page.getByRole('button', { name: 'Confirm replace with verified backup' }),
  ).toHaveCount(0);
  await page
    .getByLabel('Use the offline recovery key', { exact: true })
    .check();
  await secret.fill(recovery);
  await verify.click();
  await expect(page.getByText(/Verified: .*transactions/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Confirm replace with verified backup' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByTestId('net-spending')).toHaveText(
    money(total(monthTransactions(state, '2026-09'))),
  );
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByLabel('Search merchants').fill('Synthetic restored merchant');
  await expect(
    page.getByRole('button', { name: 'Edit Synthetic restored merchant' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(outward).toEqual([]);
});
test('closing during backup verification never revives a plaintext preview', async ({
  page,
}) => {
  const { envelope } = await createVault(pass, demoState());
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with fake data' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Verify / restore backup' }).click();
  await page
    .getByLabel('Encrypted backup file')
    .setInputFiles({
      name: 'synthetic-encrypted-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(envelope)),
    });
  await page.getByLabel('Backup unlock secret / recovery key').fill(pass);
  await page.getByRole('button', { name: 'Decrypt & verify locally' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Verify / restore backup' }).click();
  await expect(page.getByText(/Verified: .*transactions/)).toHaveCount(0);
  await expect(
    page.getByLabel('Backup unlock secret / recovery key'),
  ).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Decrypt & verify locally' }),
  ).toBeDisabled();
});
