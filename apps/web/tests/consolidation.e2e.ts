import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, (route) => route.abort());
});

test('live ledger has 58 payment days, each loan endpoint, principal balances and grand totals', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation');
  const table = page.locator('.consolidation-table');
  await expect(table.getByRole('columnheader', { name: /^Day \d+$/ })).toHaveCount(58);
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.locator('.loan-endpoint')).toHaveCount(3);
  for (const term of [45, 50, 58]) await expect(table.locator(`.loan-endpoint[title="${term}-day loan ends here"]`)).toHaveCount(1);
  const first = table.locator('tbody tr').filter({ hasText: 'mcl0001' });
  await expect(first.locator('.ledger-payment').first()).toHaveText('250.00');
  await expect(first.locator('.ledger-payment').nth(1)).toHaveText('500.00');
  await expect(first.locator('.ledger-total').nth(0)).toHaveText('750.00');
  await expect(first.locator('.ledger-total').nth(2)).toHaveText('9,250.00');
  await expect(table.locator('tfoot td').nth(1)).toHaveText('1,000.00');
  await expect(table.locator('tfoot td').nth(2)).toHaveText('30,000.00');
  await expect(table.locator('tfoot td').nth(3)).toHaveText('29,000.00');
  await expect(page.getByRole('button', { name: /Print|Export/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Jump to totals' }).click();
  await expect.poll(() => page.locator('.consolidation-workspace').evaluate((element) => element.scrollLeft)).toBeGreaterThan(3000);
  await expect(table.locator('tfoot td').last()).toBeInViewport();
  await page.screenshot({ path: '.tmp/consolidation-totals.png', fullPage: true });
});

test('search and term filters update all totals and pagination covers all matched clients', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation&many=1');
  const table = page.locator('.consolidation-table');
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(table.locator('tfoot td').nth(2)).toHaveText('650,000.00');
  await page.getByRole('navigation', { name: 'Consolidation pagination' }).getByRole('button', { name: 'Next' }).click();
  await expect(table.locator('tfoot td').nth(2)).toHaveText('650,000.00');
  await page.getByRole('searchbox', { name: 'Search consolidation clients' }).fill('mcl0002');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tfoot td').nth(1)).toHaveText('250.00');
  await expect(table.locator('tfoot td').nth(3)).toHaveText('9,750.00');
  await page.getByLabel('Filter consolidation by loan term').selectOption('45');
  await expect(page.getByText('No clients match the search and loan term.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search consolidation clients' }).clear();
  await expect(table.locator('tbody .loan-endpoint[title="45-day loan ends here"]')).toHaveCount(22);
});

test('payments beyond day 58 remain in history and all totals', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation&latepayments=1');
  const row = page.locator('.consolidation-table tbody tr').filter({ hasText: 'mcl0003' });
  await expect(row).toContainText('60 paying days · +2 after day 58');
  await expect(row.locator('.ledger-total').first()).toHaveText('6,000.00');
  await row.getByRole('button', { name: /Payment history/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('tbody tr')).toHaveCount(60);
  await expect(dialog.locator('tbody tr').last()).toContainText('60');
  await expect(dialog).toContainText('₱6,000.00');
});

test('long addresses stay on one line and open in a readable full-address dialog', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&longaddress=1');
  const address = page.locator('.client-address').first();
  const geometry = await address.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, contentWidth: element.scrollWidth, rowHeight: element.closest('tr')!.getBoundingClientRect().height }));
  expect(geometry.width).toBeLessThanOrEqual(250);
  expect(geometry.height).toBeLessThan(25);
  expect(geometry.contentWidth).toBeGreaterThan(geometry.width);
  expect(geometry.rowHeight).toBeLessThan(110);
  const text = await address.getAttribute('title');
  await address.click();
  await expect(page.getByRole('dialog').locator('.address-full')).toHaveText(text!);
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(true);
});

test('payment policy has an explicit informational default and a selectable minimum toggle', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=settings');
  const toggle = page.getByRole('checkbox', { name: 'Require collectors to meet the daily payable amount' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(toggle).not.toBeChecked();
});
