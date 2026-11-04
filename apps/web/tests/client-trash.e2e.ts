import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

test('settings offer all retention choices, save the selected policy, and discard unsaved changes', async ({ page }) => {
  const saved: { trash: { autoDeleteDays: number } }[] = [];
  await page.route('**/src/services/settings.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function saveSettings(settings) {
      await fetch('/test-api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
    }
  ` }));
  await page.route('**/test-api/settings', async route => {
    saved.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.goto('/tests/fixtures/print-studio.html?view=settings&renewal=admin');
  const retention = page.getByLabel('Automatically delete Trash', { exact: true });
  const save = page.getByRole('button', { name: 'Save settings', exact: true });
  await expect(retention).toHaveValue('0');
  await expect(retention.locator('option')).toHaveText(['Do not automatically delete', 'After 3 days', 'After 7 days', 'After 30 days']);
  await retention.selectOption('30');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(retention).toHaveValue('0');
  await expect(save).toBeDisabled();
  await retention.selectOption('7');
  await save.click();
  await expect(page.getByText('Settings saved to Firebase.', { exact: false })).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(saved[0].trash.autoDeleteDays).toBe(7);
});

async function mockAction(page: Page, failFirst = false) {
  const requests: { operation: string; operationId: string; clients: { id: string; trashId?: string }[] }[] = [];
  await page.route('**/src/services/client-trash-operations.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function mutateTrashEntry(operation, entry, operationId) {
      const response = await fetch('/test-api/client-trash', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation, operationId, clients: [entry] }) });
      if (!response.ok) throw new Error('Offline');
    }
  ` }));
  await page.route('**/test-api/client-trash', async route => {
    requests.push(route.request().postDataJSON());
    const failure = failFirst && requests.length === 1;
    await route.fulfill({ status: failure ? 503 : 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(failure
        ? { error: { status: 'UNAVAILABLE', message: 'Offline' } } : { result: { confirmed: true } }) });
  });
  return requests;
}

test('selection spans pages, supports all matching clients, and clears on filter changes and live removal', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&many=1');
  const selection = page.locator('[aria-label="Client selection"]');
  await expect(selection.getByRole('button', { name: 'Move selected to Trash' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Select clients on this page', exact: true }).check();
  await expect(selection.getByRole('status')).toHaveText('25 selected');
  await page.getByRole('navigation', { name: 'Clients pagination' }).getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('tbody input[type="checkbox"]').first().check();
  await expect(selection.getByRole('status')).toHaveText('26 selected');
  await expect(page.getByRole('checkbox', { name: 'Select clients on this page', exact: true })).toHaveJSProperty('indeterminate', true);
  await selection.getByRole('button', { name: 'Select all 65 matching' }).click();
  await expect(selection.getByRole('status')).toHaveText('65 selected');
  await page.getByRole('searchbox', { name: 'Search clients' }).fill('mcl0065');
  await expect(selection.getByRole('status')).toHaveText('0 selected');
  await selection.getByRole('button', { name: 'Select all 1 matching' }).click();
  await expect(selection.getByRole('status')).toHaveText('1 selected');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:remove-clients', { detail: ['mcl0065'] })));
  await expect(selection.getByRole('status')).toHaveText('0 selected');
});

test('bulk delete requires confirmation, recycles the exact selection, and retries with a stable request', async ({ page }) => {
  const requests = await mockAction(page, true);
  await page.goto('/tests/fixtures/print-studio.html?view=clients');
  await page.getByRole('checkbox', { name: 'Select clients on this page', exact: true }).check();
  await page.getByRole('button', { name: 'Move selected to Trash' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('3 selected clients');
  await expect(dialog).toContainText('payments and renewal history will be kept');
  expect(requests).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Move selected to Trash' }).click();
  await dialog.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toHaveLength(4);
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[1].operation).toBe('trash');
  expect(requests.slice(1).flatMap(request => request.clients.map(client => client.id)).sort()).toEqual(['mcl0001', 'mcl0002', 'mcl0003']);
  await expect(page.locator('[aria-label="Client selection"]').getByRole('status')).toHaveText('0 selected');
});

test('Trash supports bulk restore and confirmed permanent deletion with generation checks', async ({ page }) => {
  const requests = await mockAction(page);
  await page.goto('/tests/fixtures/print-studio.html?view=trash');
  await page.getByRole('checkbox', { name: 'Select trashed clients on this page' }).check();
  await page.getByRole('button', { name: 'Restore selected', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('original IDs, payments and renewal history');
  await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests[0].operation).toBe('restore');
  expect(requests).toHaveLength(3);
  expect(requests.flatMap(request => request.clients).every(entry => entry.trashId === `version-${entry.id}`)).toBe(true);
  await page.getByRole('checkbox', { name: 'Select trashed clients on this page' }).check();
  await page.getByRole('button', { name: 'Permanently delete selected', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('This cannot be undone');
  expect(requests).toHaveLength(3);
  await page.getByRole('dialog').getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests.slice(3).map(request => request.operation)).toEqual(['purge', 'purge', 'purge']);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:remove-clients', { detail: ['mcl0001', 'mcl0002', 'mcl0003'] })));
  await expect(page.getByText('Trash is empty.', { exact: true })).toBeVisible();
});

test('Trash disables stale actions and prevents restoration during interrupted permanent deletion', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=trash&offline=1');
  await expect(page.getByText(/Waiting for server confirmation/)).toBeVisible();
  await expect(page.locator('tbody').getByRole('button', { name: 'Restore', exact: true }).first()).toBeDisabled();
  await page.goto('/tests/fixtures/print-studio.html?view=trash&purging=1');
  const row = page.locator('tbody tr').filter({ hasText: 'mcl0001' });
  await expect(row.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Retry permanent deletion' })).toBeEnabled();
  await page.getByRole('checkbox', { name: 'Select trashed clients on this page' }).check();
  await expect(page.getByRole('button', { name: 'Restore selected', exact: true })).toBeDisabled();
});
