import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, (route) => route.abort());
});

test('only fully paid loans show Renew; late settlement is disabled and unpaid loans cannot renew', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  const paid = page.locator('tbody tr').filter({ hasText: 'mcl0001' });
  const late = page.locator('tbody tr').filter({ hasText: 'mcl0002' });
  const pending = page.locator('tbody tr').filter({ hasText: 'mcl0003' });
  await expect(paid.getByRole('button', { name: 'Renew', exact: true })).toBeEnabled();
  await expect(late.getByRole('button', { name: 'Renew', exact: true })).toBeDisabled();
  await expect(late.getByRole('button', { name: 'Renew', exact: true })).toHaveAttribute('title', /after its due date/);
  await expect(pending.getByRole('button', { name: 'Renew', exact: true })).toHaveCount(0);
  await expect(pending.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
  await pending.getByRole('button', { name: /Renewal history/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Renewal history');
});

test('collector views cannot grant renewals or inspect private renewal history', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=collector');
  await expect(page.getByRole('button', { name: 'Renew', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Renewal history/ })).toHaveCount(0);
});

test('developer views have the same renewal actions as admins', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=developer');
  await expect(page.locator('tbody tr').filter({ hasText: 'mcl0003' }).getByRole('button', { name: /Renewal history/ })).toBeVisible();
  await page.locator('tbody tr').filter({ hasText: 'mcl0001' }).getByRole('button', { name: 'Renew', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Renew loan/ })).toBeVisible();
  const grant = dialog.getByRole('button', { name: 'Grant renewal', exact: true });
  await expect(grant).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await expect(grant).toBeEnabled();
});

test('admin must review the new terms and explicitly approve before a renewal transaction', async ({ page }) => {
  await page.route('**/src/services/renewals.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function subscribeRenewals(_id, onData) { onData([]); return () => {}; }
    export async function renewClient(client, terms, notes) {
      const response = await fetch('/test-api/renew-client', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, expectedLoanId: client.activeLoanId || 'initial', expectedTransactionNumber: client.transactionNumber || '', terms, notes }) });
      if (!response.ok) throw new Error('Renewal failed');
    }
  ` }));
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  await page.locator('tbody tr').filter({ hasText: 'mcl0001' }).getByRole('button', { name: 'Renew', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const grant = dialog.getByRole('button', { name: 'Grant renewal', exact: true });
  await expect(grant).toBeDisabled();
  await expect(dialog.getByLabel('New approval date')).toHaveValue('2026-11-02');
  await dialog.getByLabel('Renewal principal (PHP)', { exact: true }).fill('20000');
  await dialog.getByLabel('Fixed interest (PHP)', { exact: true }).fill('2500');
  await dialog.getByLabel('Type of loan').selectOption('50');
  await dialog.getByRole('button', { name: 'Use suggested daily amount' }).click();
  await expect(dialog.getByLabel('Daily payable (PHP)', { exact: true })).toHaveValue('450');
  const approval = dialog.getByRole('checkbox');
  await approval.check();
  await expect(grant).toBeEnabled();
  await dialog.getByLabel('Daily payable (PHP)', { exact: true }).fill('460');
  await expect(approval).not.toBeChecked();
  await approval.check();
  let payload: Record<string, unknown> | undefined;
  await page.route('**/test-api/renew-client', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: { renewalId: '00004', transactionNumber: '00004' } }) });
  });
  await grant.click();
  await expect(dialog).toHaveCount(0);
  expect(payload).toMatchObject({ clientId: 'mcl0001', expectedLoanId: 'initial', expectedTransactionNumber: '00001', terms: { principal: 20000, interest: 2500, dailyAmount: 460, loanTermDays: 50, approvalDate: '2026-11-02' } });
});

test('history timeline displays preserved terms, settlement, approver and notes', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=renewal-timeline');
  await expect(page.locator('.renewal-timeline')).toContainText('Renewal 1 · Transaction 00004');
  await expect(page.locator('.renewal-timeline')).toContainText('Admin One');
  await expect(page.locator('.renewal-timeline')).toContainText('20,000.00');
  await page.getByText('Previous loan · Transaction 00001', { exact: true }).click();
  await expect(page.locator('details')).toContainText('11,250.00');
  await expect(page.locator('.renewal-notes')).toContainText('Renewal approved after review.');
});

test('a live renewal blocks stale renewal and payment forms until they are reopened', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  const row = page.locator('tbody tr').filter({ hasText: 'mcl0001' });
  await row.getByRole('button', { name: 'Renew', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('fixture:renew-client')));
  await expect(page.getByRole('dialog').getByRole('alert').first()).toContainText('renewed in another session');
  await expect(page.getByRole('button', { name: 'Grant renewal', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto('/tests/fixtures/print-studio.html?view=clients&renewal=admin');
  await row.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('fixture:renew-client')));
  await expect(page.getByRole('dialog').getByRole('alert').last()).toContainText('Close and reopen Payments');
  await expect(page.getByRole('button', { name: 'Add payment', exact: true })).toHaveCount(0);
});
