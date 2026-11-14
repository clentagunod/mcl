import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  // Exercise the production forms and preview with a persistent, isolated local store.
  // Firestore transaction behavior is covered separately in clients.test.ts.
  await page.route('**/src/services/clients.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function subscribeClients(onData) { onData([]); return () => {}; }
    export async function completeClientRecords() {}
    async function save(id, input, expected) {
      const response = await fetch('/test-api/client', { method: 'POST', body: JSON.stringify({ id, input, expected }) });
      if (!response.ok) throw new Error('This client changed in another session. Close and reopen Edit before saving.');
      const changed = { ...expected, ...input, id };
      const clients = JSON.parse(localStorage.getItem('fixture:clients') || '[]');
      localStorage.setItem('fixture:clients', JSON.stringify([...clients.filter(client => client.id !== id), changed]));
      window.dispatchEvent(new CustomEvent('fixture:upsert-client', { detail: changed }));
    }
    export async function addClient(input) { await save('new-client', input, { clientNumber: 'mcl0004', transactionNumber: '00004' }); }
    export async function updateClient(id, input, expected) { await save(id, input, expected); }
  ` }));
  await page.route('**/test-api/client', route => route.fulfill({ body: '{}' }));
});

test('client add and edit persist optional identity and co-maker details, including custom IDs and clearing', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&persistclients=1');
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add client', exact: true });
  await dialog.getByLabel('Last name', { exact: true }).fill('Reyes');
  await dialog.getByLabel('First name', { exact: true }).fill('Ana');
  await dialog.getByLabel('Permanent address', { exact: true }).fill('Tagum City');
  await dialog.getByLabel('Principal amount (₱)', { exact: true }).fill('10000');
  await dialog.getByLabel('Fixed interest (₱)', { exact: true }).fill('1250');
  await dialog.getByRole('button', { name: 'Use suggested daily amount' }).click();
  let borrower = dialog.getByRole('group', { name: 'Client ID details (optional)', exact: true });
  let coMaker = dialog.getByRole('group', { name: 'Co-maker details (optional)', exact: true });
  await borrower.getByLabel('Valid ID type', { exact: true }).selectOption('Philippine Passport');
  await borrower.getByLabel('Valid ID No.', { exact: true }).fill('0012345');
  await borrower.getByLabel('Issued on', { exact: true }).fill('2024-02-29');
  await borrower.getByLabel('Issued at', { exact: true }).fill('Davao City');
  await coMaker.getByLabel('Name', { exact: true }).fill('Maria Santos');
  await coMaker.getByLabel('Valid ID type', { exact: true }).selectOption('custom');
  await dialog.getByRole('button', { name: 'Add client', exact: true }).click();
  await expect(coMaker.getByText('Specify the custom ID type.', { exact: true })).toBeVisible();
  await coMaker.getByLabel('Custom ID type (please specify)', { exact: true }).fill('Company ID');
  await coMaker.getByLabel('Valid ID No.', { exact: true }).fill('00009');
  await coMaker.getByLabel('Issued on', { exact: true }).fill('2023-01-01');
  await coMaker.getByLabel('Issued at', { exact: true }).fill('Tagum');
  await coMaker.getByLabel('Contact number', { exact: true }).fill('+63 (917) 123-4567');
  const request = page.waitForRequest('**/test-api/client');
  await dialog.getByRole('button', { name: 'Add client', exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ input: { validIdType: 'Philippine Passport', validIdNumber: '0012345', validIdIssuedOn: '2024-02-29', validIdIssuedAt: 'Davao City', coMaker: { name: 'Maria Santos', validIdType: 'Company ID', validIdNumber: '00009', validIdIssuedOn: '2023-01-01', validIdIssuedAt: 'Tagum', contactNumber: '+639171234567' } } });
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.locator('tbody tr').filter({ hasText: 'mcl0004' }).getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit client', exact: true });
  borrower = dialog.getByRole('group', { name: 'Client ID details (optional)', exact: true });
  coMaker = dialog.getByRole('group', { name: 'Co-maker details (optional)', exact: true });
  await expect(borrower.getByLabel('Valid ID No.', { exact: true })).toHaveValue('0012345');
  await expect(coMaker.getByLabel('Valid ID type', { exact: true })).toHaveValue('custom');
  await expect(coMaker.getByLabel('Custom ID type (please specify)', { exact: true })).toHaveValue('Company ID');
  for (const section of [borrower, coMaker]) {
    await section.getByLabel('Valid ID type', { exact: true }).selectOption('');
    for (const label of ['Valid ID No.', 'Issued on', 'Issued at']) await section.getByLabel(label, { exact: true }).fill('');
  }
  await coMaker.getByLabel('Name', { exact: true }).fill('');
  await coMaker.getByLabel('Contact number', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.locator('tbody tr').filter({ hasText: 'mcl0004' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Co-maker details (optional)', exact: true }).getByLabel('Name', { exact: true })).toHaveValue('');
});

test('Print Studio saves all dynamic note details and shares them with preview, Word and HTML exports', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?persistclients=1');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await page.getByRole('button', { name: 'Edit promissory note', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit promissory note', exact: true });
  await dialog.getByLabel('First name', { exact: true }).fill('Pedro');
  await dialog.getByLabel('Cellphone number (optional)', { exact: true }).fill('09179876543');
  await dialog.getByLabel('Principal amount (₱)', { exact: true }).fill('12000');
  await dialog.getByLabel('Date of approval', { exact: true }).fill('2026-11-01');
  await dialog.getByLabel('Daily payable amount (₱)', { exact: true }).fill('300');
  const borrower = dialog.getByRole('group', { name: 'Client ID details (optional)', exact: true });
  const coMaker = dialog.getByRole('group', { name: 'Co-maker details (optional)', exact: true });
  await borrower.getByLabel('Valid ID type', { exact: true }).selectOption('Philippine Passport');
  await borrower.getByLabel('Valid ID No.', { exact: true }).fill('000123');
  await borrower.getByLabel('Issued on', { exact: true }).fill('2024-01-02');
  await borrower.getByLabel('Issued at', { exact: true }).fill('Davao');
  await coMaker.getByLabel('Name', { exact: true }).fill('Maria Reyes');
  await coMaker.getByLabel('Valid ID type', { exact: true }).selectOption('custom');
  await coMaker.getByLabel('Custom ID type (please specify)', { exact: true }).fill('Company & Staff ID');
  await coMaker.getByLabel('Valid ID No.', { exact: true }).fill('000009');
  await coMaker.getByLabel('Issued on', { exact: true }).fill('2023-02-01');
  await coMaker.getByLabel('Issued at', { exact: true }).fill('Tagum');
  await coMaker.getByLabel('Contact number', { exact: true }).fill('09171234567');
  await dialog.getByLabel('Payee / person to pay', { exact: true }).fill('MCL Lending');
  await dialog.getByLabel('Interest and service charge statement', { exact: true }).fill('Agreed fixed interest');
  await dialog.getByLabel('Execution place', { exact: true }).fill('Tagum City');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const frame = page.frameLocator('iframe');
  const signatures = frame.getByRole('table', { name: 'Co-maker and borrower signatures' });
  await expect(signatures).toContainText('MARIA REYES');
  await expect(signatures).toContainText('PEDRO SANTOS DELA CRUZ');
  await expect(signatures).toContainText('Company & Staff ID');
  await expect(signatures).toContainText('Issued on Jan 2, 2024 at Davao');
  await expect(signatures).toContainText('Issued on Feb 1, 2023 at Tagum');
  await expect(signatures).toContainText('09171234567');
  await expect(signatures).toContainText('09179876543');
  await expect(frame.locator('.promissory-sheet')).toContainText('13,250.00');
  await expect(frame.locator('.promissory-sheet')).toContainText('MCL Lending');
  await expect(frame.locator('.promissory-sheet')).toContainText('Agreed fixed interest');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  const docxPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const files = unzipSync(new Uint8Array(await readFile((await (await docxPending).path())!)));
  const xml = strFromU8(files['word/document.xml']);
  for (const text of ['MARIA REYES', 'PEDRO SANTOS DELA CRUZ', 'Philippine Passport', 'Company &amp; Staff ID', '000123', '000009', 'Jan 2, 2024', 'Feb 1, 2023', '09171234567', '09179876543', 'MCL Lending', 'Agreed fixed interest', 'Tagum City']) expect(xml).toContain(text);
  expect(xml).not.toContain('{{');
  const htmlPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click();
  const html = await readFile((await (await htmlPending).path())!, 'utf8');
  expect(html).toContain('MARIA REYES');
  expect(html).toContain('Company &amp; Staff ID');
  expect(html).not.toContain('{{');
  await page.reload();
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('.note-signatures')).toContainText('MARIA REYES');
  await page.getByRole('button', { name: 'Edit promissory note', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Payee / person to pay', { exact: true })).toHaveValue('MCL Lending');
});

test('bulk notes edit only the chosen client and View Only hides the editor', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select all matches', exact: true }).check();
  await page.getByLabel('Client to edit', { exact: true }).selectOption('mcl0002');
  await page.getByRole('button', { name: 'Edit promissory note', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Last name', { exact: true })).toHaveValue('Reyes');
  await dialog.getByRole('group', { name: 'Co-maker details (optional)', exact: true }).getByLabel('Name', { exact: true }).fill('Second client co-maker');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const sheets = page.frameLocator('iframe').locator('.promissory-sheet');
  await expect(sheets).toHaveCount(3);
  await expect(sheets.nth(0)).not.toContainText('SECOND CLIENT CO-MAKER');
  await expect(sheets.nth(1)).toContainText('SECOND CLIENT CO-MAKER');
  await expect(sheets.nth(2)).not.toContainText('SECOND CLIENT CO-MAKER');
  await page.getByRole('radio', { name: 'View Only', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Edit promissory note', exact: true })).toHaveCount(0);
});

test('a failed save keeps the note editor open and leaves the preview unchanged', async ({ page }) => {
  await page.route('**/test-api/client', route => route.fulfill({ status: 409, body: '{}' }));
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await page.getByRole('button', { name: 'Edit promissory note', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('First name', { exact: true }).fill('Unsaved');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('another session');
  await expect(dialog.getByLabel('First name', { exact: true })).toHaveValue('Unsaved');
  await expect(page.frameLocator('iframe').locator('.note-signatures')).not.toContainText('UNSAVED');
});
