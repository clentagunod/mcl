import assert from 'node:assert/strict';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.STATUS_URL || 'http://127.0.0.1:4194';
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/https:\/\//, route => route.abort());
  await page.goto(base + '/status-test.html');
  const assertQuiet = async () => {
    assert.equal(await page.locator('.connection-badge').count(), 0);
    assert.equal(await page.getByText(/^(Network available|Connected|Connection restored|Syncing with the server|Needs attention)$/).count(), 0);
  };
  const network = async online => {
    const before = await page.locator('[data-testid="refresh-count"]').textContent();
    const wasOnline = await page.evaluate(() => window.__mclNetworkOnline ?? navigator.onLine);
    await page.evaluate(value => {
      window.__mclNetworkOnline = value;
      window.dispatchEvent(new Event('mcl:connectivity'));
    }, online);
    if (online && !wasOnline) await page.waitForFunction(value => Number(document.querySelector('[data-testid="refresh-count"]').textContent) > Number(value), before);
  };
  const show = screen => page.getByRole('button', { name: 'Show ' + screen, exact: true }).click();
  const feed = value => page.getByRole('button', { name: 'Feed ' + value, exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await network(false);
  await page.getByText("No internet connection", { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Connect to sign in', exact: true }).isDisabled(), true);
  await page.screenshot({ path: '../.tmp/status-login-offline.png', fullPage: true });
  await network(true);
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'test@example.com');
  assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), 'fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Signing in…', exact: true }).waitFor();
  await assertQuiet();
  await page.getByRole('alert').filter({ hasText: 'Check your email and password.' }).waitFor();

  await show('access');
  await network(false);
  await page.getByRole('heading', { name: 'Waiting for a connection' }).waitFor();
  assert.equal(await page.locator('.status-spinner').count(), 0);
  await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Account sign in' }).waitFor();

  await show('collector');
  await page.getByRole('region', { name: 'Workspace updates' }).getByText('No internet connection', { exact: true }).waitFor();
  await assertQuiet();
  assert.equal(await page.getByRole('button', { name: 'Add payment', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('alert').count(), 0);
  await network(true);
  await page.getByRole('button', { name: 'Add payment', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount collected (₱)', { exact: true }).fill('123.45');
  await network(false);
  await dialog.getByText("No internet connection", { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Save payment', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel('Amount collected (₱)', { exact: true }).inputValue(), '123.45');
  await network(true);
  assert.equal(await dialog.getByRole('button', { name: 'Save payment', exact: true }).isDisabled(), false);
  assert.equal(await dialog.getByLabel('Amount collected (₱)', { exact: true }).inputValue(), '123.45');
  await dialog.locator('.mcl-dialog-header button[aria-label="Close"]').click();

  for (const role of ['collector', 'admin', 'developer']) {
    await show(role);
    if (role === 'admin' || role === 'developer') {
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      assert.equal(await page.getByLabel('Business name', { exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'Load saved settings', exact: true }).click();
      assert.equal(await page.getByLabel('Business name', { exact: true }).inputValue(), 'Loaded business');
      assert.equal(await page.getByRole('button', { name: 'Save settings', exact: true }).isDisabled(), false);
      await page.getByRole('link', { name: 'Collectors', exact: true }).click();
      await page.getByRole('heading', { name: 'Collectors & Admins', exact: true }).waitFor();
      await page.getByText('Fixture admin', { exact: true }).waitFor();
      await page.getByText('Fixture collector', { exact: true }).waitFor();
      assert.equal(await page.getByText('Fixture developer', { exact: true }).count(), 0);
      await page.getByRole('link', { name: 'Clients', exact: true }).click();
      await page.getByRole('button', { name: 'Index card', exact: true }).click();
      const card = page.getByRole('dialog');
      await card.getByRole('button', { name: 'Edit payment', exact: true }).click();
      const correction = page.getByRole('dialog');
      await correction.getByRole('heading', { name: 'Correct payment', exact: true }).waitFor();
      assert.equal(await correction.getByLabel('Amount collected (₱)', { exact: true }).inputValue(), '100');
      await correction.locator('.mcl-dialog-header button[aria-label="Close"]').click();
      await network(false);
      await page.getByRole('button', { name: 'Edit client', exact: true }).click();
      const edit = page.getByRole('dialog');
      await edit.getByLabel('First name', { exact: true }).fill('Offline draft');
      await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
      await edit.getByText("No internet connection", { exact: true }).waitFor();
      assert.equal(await edit.getByLabel('First name', { exact: true }).inputValue(), 'Offline draft');
      await edit.locator('.mcl-dialog-header button[aria-label="Close"]').click();
      await network(true);
    }
    await feed('syncing');
    await assertQuiet();
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Add payment', exact: true }).isDisabled(), true);
    await feed('error');
    await page.getByRole('alert').filter({ hasText: 'Unable to update records' }).waitFor();
    await feed('loading');
    await page.getByText('Loading your workspace', { exact: true }).waitFor();
    assert.equal(await page.getByText('No clients yet', { exact: true }).count(), 0);
    await network(false);
    await page.getByText('No records available yet', { exact: true }).waitFor();
    assert.equal(await page.locator('.loading-panel:visible').count(), 0);
    await feed('ready');
    for (const viewport of [{ width: 320, height: 700 }, { width: 360, height: 800 }, { width: 768, height: 900 }, { width: 1280, height: 800 }, { width: 720, height: 360 }]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), role + ' overflow at ' + viewport.width);
      const action = await page.getByRole('button', { name: 'Sign out', exact: true }).boundingBox();
      assert.ok(action && action.x >= 0 && action.x + action.width <= viewport.width);
    }
    await page.setViewportSize({ width: role === 'admin' ? 1280 : 360, height: 800 });
    await page.screenshot({ path: '../.tmp/status-' + role + '-offline.png', fullPage: true });
    await feed('syncing');
    await network(true);
    await assertQuiet();
    assert.equal(await page.getByText('No internet connection', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Add payment', exact: true }).isDisabled(), false);
    await page.screenshot({ path: '../.tmp/status-' + role + '-online.png', fullPage: true });
  }

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const business = page.getByLabel('Business name', { exact: true });
  await business.fill('My unsaved draft');
  await network(false);
  assert.equal(await page.getByRole('button', { name: 'Save settings', exact: true }).isDisabled(), true);
  await network(true);
  assert.equal(await business.inputValue(), 'My unsaved draft');
  assert.equal(await page.getByRole('button', { name: 'Save settings', exact: true }).isDisabled(), false);

  // Browser-only previews also respond when Android's validated signal is absent.
  await page.evaluate(() => { delete window.__mclNetworkOnline; });
  await context.setOffline(true);
  await page.getByRole('region', { name: 'Workspace updates' }).getByText('No internet connection', { exact: true }).waitFor();
  await assertQuiet();
  await context.setOffline(false);
  await page.waitForFunction(() => !document.querySelector('.workspace-feedback .notice-warning'));
  await assertQuiet();
  assert.deepEqual(errors, []);
  console.log('PASS: offline-only connectivity alerts; silent automatic refresh on native/browser reconnection; login, admin, developer, collector and dialog draft preservation; loading/error states; responsive layouts at 320–1280px. External HTTPS was blocked.');
  await context.close();
} finally { await browser.close(); }
