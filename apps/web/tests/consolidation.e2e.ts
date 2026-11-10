import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, (route) => route.abort());
});

test('live ledger has 58 payment days, each loan endpoint, payable balances and grand totals', async ({ page }) => {
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
  await expect(table.getByRole('columnheader', { name: 'Payable Amount', exact: true })).toHaveCount(1);
  await expect(first.locator('.ledger-total').nth(2)).toHaveText('11,250.00');
  await expect(first.locator('.ledger-total').nth(3)).toHaveText('10,500.00');
  await expect(table.getByRole('columnheader', { name: 'Contracted Interest', exact: true })).toHaveCount(1);
  await expect(first.locator('.ledger-total').nth(4)).toHaveText('1,250.00');
  await expect(table.locator('tfoot td').nth(1)).toHaveText('1,000.00');
  await expect(table.locator('tfoot td').nth(2)).toHaveText('30,000.00');
  await expect(table.locator('tfoot td').nth(3)).toHaveText('33,750.00');
  await expect(table.locator('tfoot td').nth(4)).toHaveText('32,750.00');
  await expect(table.locator('tfoot td').nth(5)).toHaveText('3,750.00');
  await expect(page.getByLabel('Consolidation totals')).toContainText('Full agreed interest · independent of collections');
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
  await expect(table.locator('tfoot td').nth(5)).toHaveText('81,250.00');
  await page.getByRole('navigation', { name: 'Consolidation pagination' }).getByRole('button', { name: 'Next' }).click();
  await expect(table.locator('tfoot td').nth(2)).toHaveText('650,000.00');
  await page.getByRole('searchbox', { name: 'Search consolidation clients' }).fill('mcl0002');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tfoot td').nth(1)).toHaveText('250.00');
  await expect(table.locator('tfoot td').nth(4)).toHaveText('11,000.00');
  await expect(table.locator('tfoot td').nth(5)).toHaveText('1,250.00');
  await page.getByLabel('Filter consolidation by loan term').selectOption('45');
  await expect(page.getByText('No clients match the search and loan term.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search consolidation clients' }).clear();
  await expect(table.locator('tbody .loan-endpoint[title="45-day loan ends here"]')).toHaveCount(22);
});

test('date windows preview before applying, preserve day positions, and clear to all dates', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation');
  const table = page.locator('.consolidation-table');
  await page.getByRole('button', { name: 'Configure dates' }).click();
  const dialog = page.getByRole('dialog', { name: 'Configure consolidation window' });
  await dialog.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(dialog.getByLabel('From', { exact: true })).toHaveValue('2026-11-02');
  await expect(dialog.getByLabel('To', { exact: true })).toHaveValue('2026-11-02');
  await expect(dialog.getByLabel('Calculation preview')).toContainText('₱750.00');
  await expect(dialog.getByLabel('Calculation preview')).toContainText('Contracted Interest');
  await expect(dialog.getByLabel('Calculation preview')).toContainText('₱3,750.00');
  await expect(table.locator('tfoot td').nth(1)).toHaveText('1,000.00');
  await dialog.getByRole('button', { name: 'Apply window' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Consolidation date window')).toContainText('Nov 2, 2026');
  await expect(table.locator('tfoot td').nth(1)).toHaveText('750.00');
  await expect(table.locator('tfoot td').nth(4)).toHaveText('33,000.00');
  await expect(table.locator('tfoot td').nth(5)).toHaveText('3,750.00');
  const first = table.locator('tbody tr').filter({ hasText: 'mcl0001' });
  await expect(first.getByRole('button', { name: /^Day 2,/ })).toContainText('500.00');
  await expect(first.getByRole('button', { name: /^Day 1,/ })).toHaveCount(0);
  await first.getByRole('button', { name: /Payment history/ }).click();
  const history = page.getByRole('dialog');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history.locator('tbody tr td').first()).toHaveText('2');
  await expect(history.locator('.ledger-history-totals')).toContainText('Contracted Interest');
  await expect(history.locator('.ledger-history-totals')).toContainText('₱1,250.00');
  await history.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Clear dates' }).click();
  await expect(table.locator('tfoot td').nth(1)).toHaveText('1,000.00');
  await expect(first.getByRole('button', { name: /^Day 1,/ })).toContainText('250.00');
});

test('custom windows include both boundaries, reject reversed or incomplete dates, and cancel changes', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation');
  await page.getByRole('button', { name: 'Configure dates' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Custom dates', exact: true }).click();
  await dialog.getByLabel('From', { exact: true }).fill('2026-11-03');
  await dialog.getByLabel('To', { exact: true }).fill('2026-11-02');
  await expect(dialog.getByText('The end date must be on or after the start date.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply window' })).toBeDisabled();
  await dialog.getByLabel('From', { exact: true }).clear();
  await expect(dialog.getByRole('button', { name: 'Apply window' })).toBeDisabled();
  await dialog.getByLabel('From', { exact: true }).fill('2026-10-21');
  await expect(dialog.getByLabel('Calculation preview')).toContainText('₱1,000.00');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Consolidation date window')).toContainText('All collection dates');
  await page.getByRole('button', { name: 'Configure dates' }).click();
  await dialog.getByRole('button', { name: 'Custom dates', exact: true }).click();
  await dialog.getByLabel('From', { exact: true }).fill('2026-10-21');
  await dialog.getByLabel('To', { exact: true }).fill('2026-10-21');
  await dialog.getByRole('button', { name: 'Apply window' }).click();
  await expect(page.locator('.consolidation-table tfoot td').nth(1)).toHaveText('250.00');
  await expect(page.locator('.consolidation-table tbody tr')).toHaveCount(3);
});

test('date windows with no receipts retain clients and paginate totals across every match', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation&many=1');
  await page.getByRole('button', { name: 'Configure dates' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await expect(dialog.getByLabel('Calculation preview')).toContainText('0 receipts');
  await dialog.getByRole('button', { name: 'Apply window' }).click();
  const table = page.locator('.consolidation-table');
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(table.locator('tfoot td').nth(1)).toHaveText('0.00');
  await expect(table.locator('tfoot td').nth(4)).toHaveText('731,250.00');
  await page.getByRole('navigation', { name: 'Consolidation pagination' }).getByRole('button', { name: 'Next' }).click();
  await expect(table.locator('tfoot td').nth(4)).toHaveText('731,250.00');
  await page.getByRole('searchbox', { name: 'Search consolidation clients' }).fill('mcl0001');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tfoot td').nth(4)).toHaveText('11,250.00');
});

test('window dialog fits mobile and follows light and dark themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation');
  await page.getByRole('button', { name: 'Configure dates' }).click();
  const dialog = page.getByRole('dialog');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    await dialog.getByRole('button', { name: 'Last 7 days', exact: true }).click();
    await expect(dialog.getByLabel('From', { exact: true })).toHaveValue('2026-10-27');
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `.tmp/consolidation-window-mobile-${theme}.png`, fullPage: true });
  }
  await dialog.getByRole('button', { name: 'Apply window' }).click();
  await expect(page.getByLabel('Consolidation date window')).toContainText('Oct 27, 2026');
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

test('long addresses keep rows compact and open in a readable full-address dialog', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&longaddress=1');
  const address = page.getByRole('button', { name: /View full address for/ }).first();
  const geometry = await address.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, contentWidth: element.scrollWidth, rowHeight: element.closest('tr')!.getBoundingClientRect().height }));
  expect(geometry.width).toBeLessThanOrEqual(250);
  expect(geometry.height).toBeLessThan(25);
  expect(geometry.rowHeight).toBeLessThan(110);
  const text = await address.getAttribute('title');
  expect(text!.length).toBeGreaterThan(2000);
  await address.click();
  await expect(page.getByRole('dialog').locator('.address-full')).toHaveText(text!);
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(true);
});

test('payment policy has an explicit informational default and a selectable minimum toggle', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=settings');
  const toggle = page.getByRole('switch', { name: 'Require collectors to meet the daily payable amount' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(toggle).not.toBeChecked();
});

test('30-day loans can be filtered and highlight their configured endpoint', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=consolidation&term30=1');
  await page.getByLabel('Filter consolidation by loan term').selectOption('30');
  const table = page.locator('.consolidation-table');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('.loan-endpoint[title="30-day loan ends here"]')).toHaveCount(1);
  await expect(table.locator('tbody tr')).toContainText('30 days');
  await expect(table.locator('tfoot td').nth(5)).toHaveText('1,250.00');
  await expect(page.locator('#consolidation-guide')).toContainText('day 30, 45, 50, 58');
});
