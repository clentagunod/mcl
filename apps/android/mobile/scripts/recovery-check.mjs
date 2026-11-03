import assert from 'node:assert/strict';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com|cloudfunctions\.net)/, route => route.abort());
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4181/adaptive-test.html');
  await page.getByRole('button', { name: 'Add payment', exact: true }).first().waitFor();
  await page.evaluate(() => localStorage.setItem('mcl-pending-test-c0', '{"id":"broken"}'));
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Add payment', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(/reserved payment could not be restored/).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Save payment', exact: true }).isDisabled(), true);
    await dialog.locator('.mcl-dialog-header button[aria-label="Close"]').click();
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('mcl-pending-test-c0')), '{"id":"broken"}');
  assert.deepEqual(errors, []);
  console.log('PASS: malformed pending receipt is retained, replacement is blocked, and the dialog remains usable across reopening.');
} finally { await browser.close(); }
