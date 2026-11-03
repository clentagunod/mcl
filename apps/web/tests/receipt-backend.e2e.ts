import { test, expect } from '@playwright/test';
test('callable receipt retries keep the reserved ID and payload after an uncertain acknowledgement', async ({ page }) => {
  test.skip(process.env.MCL_TEST_RECEIPT_BACKEND !== '1', 'Run with VITE_RECEIPT_BACKEND=callable-v1 and MCL_TEST_RECEIPT_BACKEND=1.');
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  const calls: Record<string, unknown>[] = [];
  await page.route('**/writeReceipt', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type,authorization' } });
      return;
    }
    calls.push(route.request().postDataJSON().data);
    if (calls.length === 1) await route.abort();
    else await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: { confirmed: true } }) });
  });
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  await page.locator('tbody tr').filter({ hasText: 'mcl0003' }).getByRole('button', { name: 'Payments', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount paid (₱)', { exact: true }).fill('123.45');
  await dialog.getByRole('button', { name: 'Add payment', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Retry same receipt' })).toBeEnabled();
  await expect(dialog.getByLabel('Amount paid (₱)', { exact: true })).toBeDisabled();
  expect(calls).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Retry same receipt' }).click();
  await expect(dialog.getByLabel('Amount paid (₱)', { exact: true })).toHaveValue('');
  expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
  expect(calls[0].operationId).toBe(calls[0].id);
  expect(await page.evaluate(() => localStorage.getItem('mcl-pending-admin1-mcl0003'))).toBeNull();
});
