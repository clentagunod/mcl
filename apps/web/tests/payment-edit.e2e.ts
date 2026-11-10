import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

for (const role of ['admin', 'developer']) {
  test(`${role} edits a collector receipt and the live history and balance update`, async ({ page }) => {
    const calls: Record<string, unknown>[] = [];
    await page.route('**/src/services/payments.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
      export function subscribePayments(onData) { onData([]); return () => {}; }
      export async function addPayment() { throw new Error('Not used'); }
      export async function deletePayment() { throw new Error('Not used'); }
      export async function updatePayment(id, input, expected) {
        const response = await fetch('/test-api/correction', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, input, expected }) });
        if (!response.ok) throw new Error('Connection interrupted');
        window.dispatchEvent(new CustomEvent('fixture:payment-updated', { detail: { id, input } }));
      }
    ` }));
    await page.route('**/test-api/correction', async route => {
      calls.push(route.request().postDataJSON());
      await route.fulfill({ contentType: 'application/json', body: '{}' });
    });
    await page.goto(`/tests/fixtures/print-studio.html?view=clients&renewal=${role}`);
    await page.locator('tbody tr').filter({ hasText: 'mcl0002' }).getByRole('button', { name: 'Payments', exact: true }).click();
    const history = page.getByRole('dialog', { name: /Payments/ });
    await history.locator('tbody tr').filter({ hasText: 'Collector One' }).getByRole('button', { name: 'Edit', exact: true }).first().click();
    const editor = page.getByRole('dialog', { name: 'Edit payment', exact: true });
    await expect(editor).toContainText('Collected by Collector One');
    await editor.getByLabel('Amount paid (₱)', { exact: true }).fill('300');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor).toContainText('Amount is more than the outstanding balance.');
    expect(calls).toHaveLength(0);
    await editor.getByLabel('Amount paid (₱)', { exact: true }).fill('100.001');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor).toContainText('Use no more than two decimal places.');
    expect(calls).toHaveLength(0);
    await editor.getByLabel('Amount paid (₱)', { exact: true }).fill('200');
    await editor.getByLabel('Payment date', { exact: true }).fill('2026-11-01');
    await editor.getByLabel('Notes (optional)', { exact: true }).fill('Corrected by administrator');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor).not.toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ input: { amount: 200, paymentDate: '2026-11-01', notes: 'Corrected by administrator' }, expected: { collectorId: 'collector1', collectorName: 'Collector One' } });
    await expect(history.locator('tbody tr').filter({ hasText: 'Corrected by administrator' })).toContainText('Collector One');
    await expect(history.locator('.summary-grid')).toContainText('₱50.00');
  });
}

test('a collector cannot open the receipt editor', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=collector');
  await page.locator('tbody tr').filter({ hasText: 'mcl0002' }).getByRole('button', { name: 'Payments', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
});

test('renewal while the editor is open blocks the correction', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  await page.locator('tbody tr').filter({ hasText: 'mcl0001' }).getByRole('button', { name: 'Payments', exact: true }).click();
  await page.getByRole('dialog', { name: /Payments/ }).getByRole('button', { name: 'Edit', exact: true }).first().click();
  const editor = page.getByRole('dialog', { name: 'Edit payment', exact: true });
  await page.evaluate(() => window.dispatchEvent(new Event('fixture:renew-client')));
  await expect(editor).toContainText('This loan changed.');
  await expect(editor.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
});
