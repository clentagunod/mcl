import { expect, test } from '@playwright/test';

const fixture = '/tests/fixtures/workspace.html';
const themeKey = 'mcl:preferences:theme';

test.beforeEach(async ({ context, page }) => {
  // The fixture only renders synthetic contexts. No test may read or change live data.
  await context.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  await context.route('**/src/services/client-trash-operations.ts', route => route.fulfill({
    contentType: 'text/javascript',
    body: 'export async function purgeExpiredClientTrash() {} export async function mutateTrashEntry() {}',
  }));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
});

test('theme follows the system initially, toggles by keyboard, and survives reload', async ({ page }) => {
  await page.goto(fixture);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const toggle = page.getByRole('button', { name: 'Switch to dark mode', exact: true });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: '.tmp/workspace-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('theme changes propagate between open browser tabs', async ({ page, context }) => {
  await page.goto(fixture);
  const second = await context.newPage();
  await second.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await second.goto(fixture);
  await second.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'light');
  await second.close();
});

test('theme switching remains usable when browser preference storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
  });
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('dashboard charts expose live totals and keyboard inspection for every date range', async ({ page }) => {
  await page.goto(fixture);
  await expect(page.locator('.chart-column')).toHaveCount(14);
  await expect(page.getByRole('img', { name: '36 total clients: 6 due, 24 pending, 6 paid.' })).toBeVisible();
  await page.getByRole('button', { name: 'Show last 7 days', exact: true }).click();
  await expect(page.locator('.chart-column')).toHaveCount(7);
  await page.locator('.chart-column[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.chart-column[aria-pressed="true"]')).toHaveAttribute('data-date', '2026-11-03');
  await page.keyboard.press('Home');
  await expect(page.locator('.chart-column[aria-pressed="true"]')).toHaveAttribute('data-date', '2026-10-29');
  await page.keyboard.press('End');
  await expect(page.locator('.chart-column[aria-pressed="true"]')).toHaveAttribute('data-date', '2026-11-04');
  await page.getByRole('button', { name: 'Show last 30 days', exact: true }).click();
  await expect(page.locator('.chart-column')).toHaveCount(30);
});

test('sidebar navigation works with the keyboard and exposes the current page', async ({ page }) => {
  await page.goto(fixture);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
  const mainNavigation = page.getByRole('navigation', { name: 'Main', exact: true });
  const clients = mainNavigation.getByRole('link', { name: 'Clients', exact: true });
  await clients.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  await expect(clients).toHaveAttribute('aria-current', 'page');
  await expect(mainNavigation.getByRole('link', { name: 'Dashboard', exact: true })).not.toHaveAttribute('aria-current', 'page');
});

test('all workspace pages render inside the real shell without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture);
  const navigation = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(navigation.getByRole('link')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'Dashboard should fit the desktop viewport').toBeLessThanOrEqual(1);
  await page.screenshot({ path: '.tmp/workspace-desktop.png', fullPage: true });

  const destinations = [
    ['Clients', 'Clients'],
    ['Printables', 'Print studio'],
    ['Consolidation', 'Consolidation / Liquidation'],
    ['Collectors & Admins', 'Collectors & Admins'],
    ['Holidays', 'Holidays'],
    ['Settings', 'Settings'],
    ['Trash', 'Trash'],
  ];
  for (const [label, heading] of destinations) {
    await navigation.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('© MCL Lending App');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'ClentIndustries' })).toHaveAttribute('href', 'https://clentindustries.vercel.app');
    await expect(navigation.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('main')).not.toContainText('Something went wrong');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${label} should keep overflow inside its own workspace`).toBeLessThanOrEqual(1);
    if (label === 'Printables') {
      await expect(page.getByTitle('Index Card print preview', { exact: true })).toBeVisible();
      await page.screenshot({ path: '.tmp/workspace-printables.png', fullPage: true });
    }
    if (label === 'Settings') await page.screenshot({ path: '.tmp/workspace-settings.png', fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('client directory fits one desktop screen while rows scroll within the table', async ({ page }) => {
  await page.goto(`${fixture}?route=/clients`);
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  const directory = page.locator('.clients-directory');
  const table = page.locator('.clients-table-wrap');
  const pagination = page.getByRole('navigation', { name: 'Clients pagination' });
  const box = await directory.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const dimensions = await table.evaluate(element => ({
    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await table.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('.clients-table thead th').first()).toBeInViewport();
  await expect(pagination).toBeInViewport();
  await page.screenshot({ path: '.tmp/workspace-clients.png', fullPage: true });
});

test('mobile navigation opens, changes page, and closes without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixture);
  const openNavigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  const sidebar = page.locator('#workspace-sidebar');
  await expect(openNavigation).toBeVisible();
  await expect(openNavigation).toHaveAttribute('aria-expanded', 'false');
  await openNavigation.click();
  await expect(openNavigation).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toHaveClass(/is-open/);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  await expect(openNavigation).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).not.toHaveClass(/is-open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '.tmp/workspace-mobile.png', fullPage: true });
  await openNavigation.click();
  await sidebar.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await expect(openNavigation).toHaveAttribute('aria-expanded', 'false');
});

test('every workspace remains usable in dark mode on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto(fixture);
  const overflowing: string[] = [];
  for (const label of ['Dashboard', 'Clients', 'Printables', 'Consolidation', 'Collectors & Admins', 'Holidays', 'Settings', 'Trash']) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: label, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) overflowing.push(`${label}: ${overflow}px`);
  }
  expect(overflowing, 'Keep horizontal overflow inside the relevant table or preview').toEqual([]);
});
