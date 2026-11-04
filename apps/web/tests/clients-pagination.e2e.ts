import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, (route) => route.abort());
  await page.goto('/tests/fixtures/print-studio.html?view=clients&many=1');
});

test('client pagination covers every row and page size, with correct boundaries', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: 'Clients pagination' });
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await expect(navigation.getByRole('status')).toHaveText('Showing 1–25 of 65 clients');
  await expect(navigation.getByRole('button', { name: 'Previous' })).toBeDisabled();
  const firstIds = await page.locator('tbody tr td:nth-child(2) .small:last-child').allTextContents();
  await navigation.getByRole('button', { name: 'Next' }).click();
  await expect(navigation.getByRole('status')).toHaveText('Showing 26–50 of 65 clients');
  const nextIds = await page.locator('tbody tr td:nth-child(2) .small:last-child').allTextContents();
  expect(firstIds.filter((id) => nextIds.includes(id))).toEqual([]);
  await navigation.getByRole('button', { name: 'Last' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(15);
  await expect(navigation.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByLabel('Rows per page').selectOption('10');
  await expect(navigation.getByRole('status')).toHaveText('Showing 1–10 of 65 clients');
  await navigation.getByRole('button', { name: 'Last' }).click();
  await expect(navigation.getByRole('status')).toHaveText('Showing 61–65 of 65 clients');
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await navigation.getByRole('button', { name: 'First', exact: true }).click();
  await expect(navigation.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute('aria-current', 'page');
});

test('search and status filters run across all clients and reset the page', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: 'Clients pagination' });
  await navigation.getByRole('button', { name: 'Last' }).click();
  await page.getByRole('searchbox', { name: 'Search clients' }).fill('mcl0065');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('mcl0065');
  await expect(navigation.getByRole('status')).toHaveText('Showing 1–1 of 1 clients');
  await page.locator('tbody tr').getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('mcl0065');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search clients' }).clear();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByLabel('Filter by status').selectOption('paid');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(navigation.getByRole('status')).toHaveText('Showing 0–0 of 0 clients');
  await page.getByLabel('Filter by status').selectOption('all');
  await expect(navigation.getByRole('status')).toHaveText('Showing 1–25 of 65 clients');
});

test('live list shrink clamps to a valid page without returning to a stale page', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: 'Clients pagination' });
  await navigation.getByRole('button', { name: 'Last' }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:client-count', { detail: 26 })));
  await expect(navigation.getByRole('status')).toHaveText('Showing 26–26 of 26 clients');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:client-count', { detail: 65 })));
  await expect(navigation.getByRole('status')).toHaveText('Showing 26–50 of 65 clients');
  await page.screenshot({ path: '.tmp/clients-pagination.png', fullPage: true });
});
