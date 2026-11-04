import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  await page.goto('/tests/fixtures/accounts.html');
});

test('lists both roles and prevents deleting or deactivating the current admin', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Collectors & Admins' })).toBeVisible();
  await expect(page.getByText('Hidden Developer')).toHaveCount(0);
  await expect(page.getByText('developer@example.com')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add developer/i })).toHaveCount(0);
  const self = page.getByRole('row').filter({ hasText: 'Current Admin' });
  await expect(self).toContainText('(You)');
  await expect(self.getByRole('cell', { name: 'Admin', exact: true })).toBeVisible();
  await expect(self.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await expect(self.getByRole('button', { name: 'Deactivate', exact: true })).toBeDisabled();
  await expect(self.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
  const other = page.getByRole('row').filter({ hasText: 'Other Admin' });
  await expect(other.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
  await expect(other.getByRole('button', { name: 'Deactivate', exact: true })).toBeEnabled();
  await expect(page.getByRole('row').filter({ hasText: 'Collector One' }).getByRole('cell', { name: 'Collector', exact: true })).toBeVisible();
});

test('developers can manage visible accounts while remaining hidden themselves', async ({ page }) => {
  await page.goto('/tests/fixtures/accounts.html?actor=developer');
  await expect(page.getByRole('button', { name: '+ Add admin', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '+ Add collector', exact: true })).toBeEnabled();
  await expect(page.getByText('Hidden Developer')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('row').filter({ hasText: 'Current Admin' }).getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '+ Add admin', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Add admin' })).toBeVisible();
});

test('offers admin and collector forms with the correct access descriptions and validation', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add admin', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Add admin' })).toBeVisible();
  await expect(dialog).toContainText('Admins have full access to this website');
  await expect(dialog).toContainText('The admin signs in to this website');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.getByLabel('Full name')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Login email')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: '+ Add collector', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Add collector' })).toBeVisible();
  await expect(dialog).toContainText('The collector signs in on the Android app');
});

test('supports editing yourself and confirms deletion of other admins', async ({ page }) => {
  await page.getByRole('row').filter({ hasText: 'Current Admin' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Edit admin' })).toBeVisible();
  await expect(dialog.getByLabel('Full name')).toHaveValue('Current Admin');
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Other Admin' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Delete admin' })).toBeVisible();
  await expect(dialog).toContainText('Delete Other Admin?');
  await expect(dialog).toContainText('Payments they already entered are kept');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Other Admin' })).toBeVisible();
});

test('disables account mutations if the account feed fails', async ({ page }) => {
  await page.goto('/tests/fixtures/accounts.html?error=1');
  await expect(page.getByRole('alert')).toHaveText('Account list unavailable.');
  for (const button of await page.getByRole('button').all()) await expect(button).toBeDisabled();
});

test('paginates filtered accounts and keeps navigation valid when live records disappear', async ({ page }) => {
  await page.goto('/tests/fixtures/accounts.html?many=1');
  const pagination = page.getByRole('navigation', { name: 'Accounts pagination' });
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(pagination).toContainText('Showing 1–10 of 30 accounts');
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(pagination).toContainText('Page 2 of 3');
  await expect(pagination).toContainText('Showing 11–20 of 30 accounts');
  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(pagination.getByRole('button', { name: 'Next' })).toBeDisabled();

  await page.getByRole('searchbox', { name: 'Search accounts' }).fill('Team member 27');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(pagination).toContainText('Page 1 of 1');
  await expect(page.locator('tbody')).toContainText('Team member 27');
  await page.getByRole('searchbox', { name: 'Search accounts' }).clear();
  await page.getByRole('combobox', { name: 'Filter accounts by role' }).selectOption('collector');
  await expect(pagination).toContainText('of 15 accounts');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(page.locator('tbody').getByText('Admin', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Filter accounts by status' }).selectOption('inactive');
  await expect(page.locator('tbody tr')).toHaveCount(7);
  await expect(page.locator('tbody').getByText('Active', { exact: true })).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Filter accounts by role' }).selectOption('all');
  await page.getByRole('combobox', { name: 'Filter accounts by status' }).selectOption('all');
  await pagination.getByLabel('Rows per page').selectOption('25');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:account-count', { detail: 3 })));
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(pagination).toContainText('Page 1 of 1');
  await expect(pagination).toContainText('Showing 1–3 of 3 accounts');
});
