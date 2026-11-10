import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

test('adds a 30-day client while preserving the existing 45-day form default', async ({ page }) => {
  let input: Record<string, unknown> | undefined;
  await page.route('**/src/services/clients.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function subscribeClients(onData) { onData([]); return () => {}; }
    export async function completeClientRecords() {}
    export async function updateClient() { throw new Error('Not used'); }
    export async function addClient(input) {
      await fetch('/test-api/client', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      window.dispatchEvent(new CustomEvent('fixture:upsert-client', { detail: { ...input, id: 'mcl0030', clientNumber: 'mcl0030', transactionNumber: '00030' } }));
    }
  ` }));
  await page.route('**/test-api/client', async route => { input = route.request().postDataJSON(); await route.fulfill({ body: '{}' }); });
  await page.goto('/tests/fixtures/print-studio.html?view=clients');
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add client', exact: true });
  await expect(dialog.getByLabel('Type of loan', { exact: true })).toHaveValue('45');
  await dialog.getByLabel('Last name', { exact: true }).fill('Thirty');
  await dialog.getByLabel('First name', { exact: true }).fill('New');
  await dialog.getByLabel('Permanent address', { exact: true }).fill('Tagum City');
  await dialog.getByLabel('Principal amount (₱)', { exact: true }).fill('10000');
  await dialog.getByLabel('Fixed interest (₱)', { exact: true }).fill('1250');
  await dialog.getByLabel('Type of loan', { exact: true }).selectOption('30');
  await dialog.getByRole('button', { name: 'Use suggested daily amount', exact: true }).click();
  await expect(dialog.getByLabel('Daily payable amount (₱)', { exact: true })).toHaveValue('375');
  await dialog.getByRole('button', { name: 'Add client', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(input).toMatchObject({ loanTermDays: 30, dailyAmount: 375, cellphone: '', principal: 10000, interest: 1250 });
  await expect(page.locator('tbody tr').filter({ hasText: 'mcl0030' })).toContainText('of 30');
});

test('editing a 30-day client retains its duration and expected original details', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route('**/src/services/clients.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function subscribeClients(onData) { onData([]); return () => {}; }
    export async function completeClientRecords() {}
    export async function addClient() { throw new Error('Not used'); }
    export async function updateClient(id, input, expected) {
      await fetch('/test-api/client', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, input, expected }) });
      window.dispatchEvent(new CustomEvent('fixture:upsert-client', { detail: { ...expected, ...input, id } }));
    }
  ` }));
  await page.route('**/test-api/client', async route => { payload = route.request().postDataJSON(); await route.fulfill({ body: '{}' }); });
  await page.goto('/tests/fixtures/print-studio.html?view=clients&term30=1');
  const row = page.locator('tbody tr').filter({ hasText: 'mcl0001' });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit client', exact: true });
  await expect(dialog.getByLabel('Type of loan', { exact: true })).toHaveValue('30');
  await dialog.getByLabel('Daily payable amount (₱)', { exact: true }).fill('380');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(payload).toMatchObject({ id: 'mcl0001', input: { loanTermDays: 30, dailyAmount: 380 }, expected: { loanTermDays: 30, dailyAmount: 375 } });
  await expect(row).toContainText('of 30');
});

test('a paid 30-day loan can be renewed with another 30-day term', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route('**/src/services/renewals.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function subscribeRenewals(_id, onData) { onData([]); return () => {}; }
    export async function renewClient(client, terms, notes) {
      await fetch('/test-api/renewal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: client.id, terms, notes }) });
    }
  ` }));
  await page.route('**/test-api/renewal', async route => { payload = route.request().postDataJSON(); await route.fulfill({ body: '{}' }); });
  await page.goto('/tests/fixtures/print-studio.html?view=clients&term30=1&renewal=admin');
  await page.locator('tbody tr').filter({ hasText: 'mcl0001' }).getByRole('button', { name: 'Renew', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Type of loan', { exact: true })).toHaveValue('30');
  await dialog.getByRole('button', { name: 'Use suggested daily amount', exact: true }).click();
  await expect(dialog.getByLabel('Daily payable (PHP)', { exact: true })).toHaveValue('375');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Grant renewal', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(payload).toMatchObject({ clientId: 'mcl0001', terms: { loanTermDays: 30, dailyAmount: 375 } });
});

test('30-day index cards show 30 payment entries and the client loan due date', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&term30=1');
  const dueDate = (await page.locator('tbody tr').filter({ hasText: 'mcl0001' }).locator('.client-schedule strong').innerText()).replace(/^Due /, '');
  await page.goto('/tests/fixtures/print-studio.html?term30=1');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.index-entry')).toHaveCount(30);
  await expect(frame.locator('.index-details')).toContainText('No. of Days: 30');
  await expect(frame.locator('.index-due-date')).toHaveText(`Due date: ${dueDate}`);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
});
