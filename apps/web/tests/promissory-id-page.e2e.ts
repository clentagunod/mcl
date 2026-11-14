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

const settingsUrl = '/tests/fixtures/print-studio.html?view=settings&renewal=admin&persistsettings=1#settings-promissory';

test('missing co-maker fields print N/A and the attachment is absent by default', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.note-signatures tr')).toHaveCount(6);
  expect(await frame.locator('.note-signatures tr').evaluateAll(rows => rows.map(row => row.firstElementChild?.textContent))).toEqual(['N/A', 'Co-Maker Signature over Printed Name', 'Valid ID: N/A', 'Valid ID #: N/A', 'Issued on N/A at N/A', 'Contact Number: N/A']);
  await expect(frame.locator('.sheet')).toHaveCount(1);
  await expect(frame.locator('.promissory-id-sheet')).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const files = unzipSync(new Uint8Array(await readFile((await (await pending).path())!)));
  const xml = strFromU8(files['word/document.xml']);
  expect(xml).toContain('Issued on N/A at N/A');
  expect(xml).not.toContain('Put your ID here');
});

test('saved ID sizes survive reload and apply to preview, Word, HTML, PDF and bulk notes', async ({ page, context }) => {
  await page.goto(settingsUrl);
  const toggle = page.getByRole('switch', { name: 'Include ID placement page', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  for (const [label, value] of [['Client ID box width (mm)', '90'], ['Client ID box height (mm)', '60'], ['Co-maker ID box width (mm)', '100'], ['Co-maker ID box height (mm)', '65']]) await page.getByLabel(label, { exact: true }).fill(value);
  const save = page.waitForRequest('**/test-api/settings');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  expect((await save).postDataJSON()).toMatchObject({ uid: 'admin1', settings: { promissory: { includeIdPage: true, clientIdWidthMm: 90, clientIdHeightMm: 60, coMakerIdWidthMm: 100, coMakerIdHeightMm: 65 } } });
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
  await expect(page.getByLabel('Client ID box width (mm)', { exact: true })).toHaveValue('90');
  await expect(page.getByLabel('Co-maker ID box height (mm)', { exact: true })).toHaveValue('65');
  await page.goto('/tests/fixtures/print-studio.html?persistsettings=1');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.sheet')).toHaveCount(2);
  await expect(frame.locator('.id-placement-box')).toHaveCount(2);
  await expect(frame.locator('.id-placement-box').first()).toHaveText('Put your ID here');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  const sizes = await frame.locator('.id-placement-box').evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  for (const [i, width, height] of [[0, 90, 60], [1, 100, 65]]) {
    expect(sizes[i].width).toBeCloseTo(width / 25.4 * 96, 1);
    expect(sizes[i].height).toBeCloseTo(height / 25.4 * 96, 1);
  }
  const wordPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const files = unzipSync(new Uint8Array(await readFile((await (await wordPending).path())!)));
  const xml = strFromU8(files['word/document.xml']);
  expect(xml.match(/Put your ID here/g)).toHaveLength(2);
  expect(xml).toContain('<w:pageBreakBefore/>');
  expect(xml).toContain(`w:trHeight w:val="${Math.round(60 / 25.4 * 1440)}" w:hRule="exact"`);
  expect(xml).toContain(`w:tblW w:w="${Math.round(100 / 25.4 * 1440)}"`);
  expect(await page.evaluate(source => new DOMParser().parseFromString(source, 'application/xml').getElementsByTagName('parsererror').length, xml)).toBe(0);
  const htmlPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click();
  const html = await readFile((await (await htmlPending).path())!, 'utf8');
  expect(html.match(/class="sheet promissory-id-sheet"/g)).toHaveLength(1);
  expect(html).toContain('width:90mm;height:60mm');
  const output = await context.newPage();
  await output.setContent(html);
  await output.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const pdf = await output.pdf({ preferCSSPageSize: true, printBackground: true, path: '.tmp/promissory-with-id-page.pdf' });
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  await output.close();
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select all matches', exact: true }).check();
  await expect(frame.locator('.sheet')).toHaveCount(6);
  expect(await frame.locator('.sheet').evaluateAll(elements => elements.map(element => element.className))).toEqual(['sheet promissory-sheet', 'sheet promissory-id-sheet', 'sheet promissory-sheet', 'sheet promissory-id-sheet', 'sheet promissory-sheet', 'sheet promissory-id-sheet']);
  const bundlePending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX bundle', exact: true }).click();
  const bundle = unzipSync(new Uint8Array(await readFile((await (await bundlePending).path())!)));
  expect(Object.keys(bundle)).toHaveLength(3);
  for (const bytes of Object.values(bundle)) expect(strFromU8(unzipSync(bytes)['word/document.xml']).match(/Put your ID here/g)).toHaveLength(2);
  await page.goto(settingsUrl);
  await toggle.uncheck();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.getByLabel('Co-maker ID box width (mm)', { exact: true })).toHaveValue('100');
  await page.goto('/tests/fixtures/print-studio.html?persistsettings=1');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('.sheet')).toHaveCount(1);
});

test('invalid ID layouts cannot be saved and failed saves retain the draft', async ({ page }) => {
  let requests = 0;
  await page.route('**/test-api/settings', route => { requests += 1; return route.fulfill({ status: 500, body: '{}' }); });
  await page.goto(settingsUrl);
  await page.getByRole('switch', { name: 'Include ID placement page', exact: true }).check();
  await page.getByLabel('Client ID box width (mm)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('do not fit');
  expect(requests).toBe(0);
  await page.getByLabel('Client ID box width (mm)', { exact: true }).fill('90');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(page.getByLabel('Client ID box width (mm)', { exact: true })).toHaveValue('90');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Include ID placement page', exact: true })).not.toBeChecked();
});
