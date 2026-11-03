import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com|cloudfunctions\.net)/, route => route.abort());
});
test('malformed reserved receipts show a recovery message and block replacement without crashing', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  await page.evaluate(() => localStorage.setItem('mcl-pending-admin1-mcl0003', '{"id":"broken"}'));
  await page.locator('tbody tr').filter({ hasText: 'mcl0003' }).getByRole('button', { name: 'Payments', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('reserved payment could not be restored');
  await expect(page.getByRole('button', { name: 'Add payment', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('mcl-pending-admin1-mcl0003'))).toBe('{"id":"broken"}');
  expect(errors).toEqual([]);
});
test('a valid uncertain receipt is restored with its original values across modal closure', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  const receipt = { id: 'reserved', input: { clientId: 'mcl0003', loanId: '00003', amount: 123.45, paymentDate: '2026-11-02', collectorId: 'admin1', collectorName: 'Admin One', notes: 'Original attempt' } };
  await page.evaluate(value => localStorage.setItem('mcl-pending-admin1-mcl0003', JSON.stringify(value)), receipt);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('tbody tr').filter({ hasText: 'mcl0003' }).getByRole('button', { name: 'Payments', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Amount paid (₱)', { exact: true })).toHaveValue('123.45');
    await expect(dialog.getByLabel('Amount paid (₱)', { exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Retry same receipt' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mcl-pending-admin1-mcl0003')!))).toEqual(receipt);
});
