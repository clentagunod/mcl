import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  await page.route('**/src/services/settings.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function subscribeSettings() { return () => {}; }
    export async function initializeSettings() {}
    export async function saveSettings(settings, uid, expected) {
      const response = await fetch('/test-api/settings', { method: 'POST', body: JSON.stringify({ settings, uid, expected }) });
      if (!response.ok) throw new Error('Settings could not be saved.');
      localStorage.setItem('fixture:settings', JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent('fixture:settings-updated', { detail: settings }));
    }
  ` }));
  await page.route('**/test-api/settings', route => route.fulfill({ body: '{}' }));
});

test('paid-only defaults to today, follows collection dates, filters exports and prevents empty printing', async ({ page, context }) => {
  await page.goto('/tests/fixtures/print-studio.html?fullscreen=1&many=1');
  await page.getByRole('tab', { name: 'Daily Summary Sheet', exact: true }).click();
  const date = page.getByLabel('Collection date', { exact: true });
  await expect(date).toHaveValue('2026-11-02');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.summary-table tbody tr')).toHaveCount(2);
  await expect(frame.locator('tfoot')).toContainText('750.00');
  await expect(frame.locator('.summary-scope')).toHaveText('2 clients with payments');
  await expect(page.getByRole('checkbox', { name: /Select .*\(mcl0003\)/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  const wordDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const files = unzipSync(new Uint8Array(await readFile((await (await wordDownload).path())!)));
  const xml = strFromU8(files['word/document.xml']);
  expect(xml).toContain('750.00');
  expect(xml).not.toContain('mcl0003');
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click();
  const html = await readFile((await (await htmlDownload).path())!, 'utf8');
  expect(html).not.toContain('mcl0003');
  const output = await context.newPage();
  await output.setContent(html);
  await output.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const pdf = await output.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  await output.close();
  await date.fill('2026-10-21');
  await expect(frame.locator('.summary-table tbody tr')).toHaveCount(1);
  await expect(frame.locator('tfoot')).toContainText('250.00');
  await date.fill('2026-10-22');
  await expect(page.getByText('No clients have payments on this collection date.', { exact: false })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  for (const name of ['Print', 'Save PDF', 'Export DOCX', 'Export HTML']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await date.fill('2026-11-02');
  await expect(frame.locator('.summary-table tbody tr')).toHaveCount(2);
});

test('the saved switch survives reload in both states and off includes nonpaying clients', async ({ page }) => {
  const settingsUrl = '/tests/fixtures/print-studio.html?view=settings&renewal=admin&persistsettings=1#settings-summary';
  const toggle = page.getByRole('switch', { name: 'Only show clients with payments', exact: true });
  for (const enabled of [false, true]) {
    await page.goto(settingsUrl);
    await expect(toggle).toBeChecked({ checked: !enabled });
    await toggle.setChecked(enabled);
    const request = page.waitForRequest('**/test-api/settings');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    expect((await request).postDataJSON()).toMatchObject({ uid: 'admin1', settings: { summary: { onlyClientsWithPayments: enabled } } });
    await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
    await page.reload();
    await expect(toggle).toBeChecked({ checked: enabled });
    await page.goto('/tests/fixtures/print-studio.html?persistsettings=1&fullscreen=1');
    await page.getByRole('tab', { name: 'Daily Summary Sheet', exact: true }).click();
    await expect(page.frameLocator('iframe').locator('.summary-table tbody tr')).toHaveCount(enabled ? 2 : 3);
    await expect(page.frameLocator('iframe').locator('tfoot')).toContainText('750.00');
  }
});
