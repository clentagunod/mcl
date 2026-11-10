import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  await page.route(/\/src\/components\/TrashAutoDeletion\.tsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export function TrashAutoDeletion() { return null; }' }));
  await page.route(/\/src\/services\/settings\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function saveSettings(settings) { window.dispatchEvent(new CustomEvent('fixture:settings', { detail: settings })); }
    export async function initializeSettings() {}
    export function subscribeSettings() { return () => {}; }
  ` }));
  await page.route(/\/src\/services\/expenses\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    let sequence = 0;
    const history = new Map();
    export const reserveExpenseId = () => 'new-expense-' + ++sequence;
    export const reserveExpenseCategoryId = () => 'new-category-' + ++sequence;
    export function subscribeExpenses() { return () => {}; }
    export function subscribeExpenseCategories() { return () => {}; }
    export function subscribeExpenseHistory(id, onData) { onData(history.get(id) || []); return () => {}; }
    export async function saveExpense(id, input, revision = 0) {
      const row = { ...input, id, status: 'posted', voidReason: '', revision: revision + 1, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin', updatedBy: 'admin' };
      history.set(id, [...(history.get(id) || []), row]);
      window.dispatchEvent(new CustomEvent('fixture:expense', { detail: row }));
    }
    export async function voidExpense(expense, reason) {
      const row = { ...expense, status: 'void', voidReason: reason, revision: expense.revision + 1, updatedAt: new Date() };
      history.set(expense.id, [...(history.get(expense.id) || []), row]);
      window.dispatchEvent(new CustomEvent('fixture:expense', { detail: row }));
    }
    export async function saveExpenseCategory(name, active, category, reservedId) {
      window.dispatchEvent(new CustomEvent('fixture:category', { detail: { id: category?.id || reservedId || 'new-category-' + ++sequence, name, active, revision: (category?.revision || 0) + 1 } }));
    }
  ` }));
});

test('identifier reset is off by default and saves a shared preference with the current numbering format', async ({ page }) => {
  await page.goto('/tests/fixtures/accounting.html?route=/settings');
  const toggle = page.getByRole('switch', { name: 'Reset numbering when all clients are permanently deleted', exact: true });
  await expect(toggle).not.toBeChecked();
  await page.getByLabel('Client ID prefix', { exact: true }).fill('loan');
  await page.getByLabel('Client ID digits', { exact: true }).fill('3');
  await expect(page.locator('#settings-trash')).toContainText('loan001 and 00001');
  await toggle.check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  const main = page.getByRole('navigation', { name: 'Main', exact: true });
  await main.getByRole('link', { name: 'Consolidation', exact: true }).click();
  await main.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(toggle).toBeChecked();
});

test('default consolidation shows only required metrics and six independent settings switches', async ({ page }) => {
  await page.goto('/tests/fixtures/accounting.html?defaultMetrics=1');
  const required = ['Total payment', 'Principal', 'Payable Amount', 'Contracted Interest'];
  await expect(page.getByLabel('Consolidation totals').locator('.ledger-stat')).toHaveCount(4);
  for (const label of required) await expect(page.locator('.consolidation-table').getByRole('columnheader', { name: label, exact: true })).toHaveCount(1);
  await expect(page.locator('.consolidation-table').getByRole('columnheader', { name: 'Balance', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Configure dates' }).click();
  await expect(page.getByLabel('Calculation preview').locator('dt')).toHaveCount(4);
  for (const label of required) await expect(page.getByLabel('Calculation preview').getByText(label, { exact: true })).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Payment history for/ }).click();
  await expect(page.locator('.ledger-history-totals > div')).toHaveCount(4);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click();
  const section = page.locator('#settings-consolidation');
  await expect(section.getByRole('switch')).toHaveCount(6);
  for (const label of required) await expect(section.getByRole('switch', { name: label, exact: true })).toHaveCount(0);
  for (const label of ['Balance', 'Interest collected', 'Recorded expenses', 'Net income', 'Principal released', 'Cash surplus / deficit']) {
    await expect(section.getByRole('switch', { name: label, exact: true })).not.toBeChecked();
  }
});

test('saved visibility applies across reports while hidden expenses still reduce net income', async ({ page }) => {
  await page.goto('/tests/fixtures/accounting.html?route=/settings&defaultMetrics=1');
  const main = page.getByRole('navigation', { name: 'Main', exact: true });
  const section = page.locator('#settings-consolidation');
  await section.getByRole('switch', { name: 'Net income', exact: true }).check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await main.getByRole('link', { name: 'Consolidation', exact: true }).click();
  const cards = page.getByLabel('Consolidation totals');
  await expect(cards.locator('.ledger-stat')).toHaveCount(5);
  const net = cards.locator('.ledger-stat').filter({ has: page.locator('.stat-label', { hasText: /^Net income$/ }) });
  await expect(net.locator('.stat-value')).toHaveText('₱250.00');
  await expect(cards.locator('.stat-label', { hasText: /^Recorded expenses$/ })).toHaveCount(0);
  await expect(page.locator('.consolidation-table').getByRole('columnheader', { name: 'Recorded expenses', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Configure dates' }).click();
  await expect(page.getByLabel('Calculation preview').locator('dt')).toHaveCount(5);
  await expect(page.getByLabel('Calculation preview')).toContainText('₱250.00');
  await expect(page.getByLabel('Calculation preview').getByText('Recorded expenses', { exact: true })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Payment history for/ }).click();
  await expect(page.locator('.ledger-history-totals > div')).toHaveCount(5);
  await expect(page.locator('.ledger-history-totals')).toContainText('₱300.00');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await main.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(section.getByRole('switch', { name: 'Net income', exact: true })).toBeChecked();
  await expect(section.getByRole('switch', { name: 'Recorded expenses', exact: true })).not.toBeChecked();
  for (const label of ['Balance', 'Interest collected', 'Recorded expenses', 'Principal released', 'Cash surplus / deficit']) {
    await section.getByRole('switch', { name: label, exact: true }).check();
  }
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await main.getByRole('link', { name: 'Consolidation', exact: true }).click();
  await expect(cards.locator('.ledger-stat')).toHaveCount(10);
  await expect(net.locator('.stat-value')).toHaveText('₱250.00');
  await page.getByRole('button', { name: 'Configure dates' }).click();
  await expect(page.getByLabel('Calculation preview').locator('dt')).toHaveCount(10);
});

test('financial report distinguishes agreed interest, collections, expenses and cash by date and scope', async ({ page }) => {
  await page.goto('/tests/fixtures/accounting.html');
  const cards = page.getByLabel('Consolidation totals');
  const amount = (label: string) => cards.locator('.ledger-stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp(`^${label}$`) }) }).locator('.stat-value');
  await expect(amount('Contracted Interest')).toHaveText('₱1,250.00');
  await expect(amount('Interest collected')).toHaveText('₱500.00');
  await expect(amount('Recorded expenses')).toHaveText('₱250.00');
  await expect(amount('Net income')).toHaveText('₱250.00');
  await expect(amount('Cash surplus / deficit')).toHaveText('₱250.00');
  await page.getByRole('button', { name: 'Configure dates' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const preview = page.getByLabel('Calculation preview');
  await expect(preview).toContainText('Interest collected');
  await expect(preview).toContainText('₱350.00');
  await page.getByRole('button', { name: 'Apply window' }).click();
  await expect(amount('Interest collected')).toHaveText('₱500.00');
  await expect(amount('Principal released')).toHaveText('₱0.00');
  await expect(amount('Cash surplus / deficit')).toHaveText('₱350.00');
  await page.getByRole('searchbox', { name: 'Search consolidation clients' }).fill('mcl0001');
  await expect(amount('Recorded expenses')).toHaveText('₱200.00');
  await expect(amount('Net income')).toHaveText('₱300.00');
  await expect(amount('Cash surplus / deficit')).toHaveText('₱400.00');
  await expect(page.getByText(/Filtered report: shared business expenses are excluded/)).toBeVisible();
});

test('saved settings change allocation and hide expenses while retaining records for re-enabling', async ({ page }) => {
  await page.goto('/tests/fixtures/accounting.html?route=/settings');
  const main = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(main.getByRole('link', { name: 'Expenses', exact: true })).toHaveCount(1);
  await page.getByLabel('Payment allocation', { exact: true }).selectOption('proportional');
  await expect(page.locator('.settings-allocation-example')).toContainText('₱555.56');
  await page.getByRole('switch', { name: 'Enable expenses', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(main.getByRole('link', { name: 'Expenses', exact: true })).toHaveCount(0);
  await main.getByRole('link', { name: 'Consolidation', exact: true }).click();
  await expect(page.getByLabel('Consolidation totals')).toContainText('₱1,166.67');
  await expect(page.getByText('Expenses are disabled; no recorded expenses are deducted.', { exact: false })).toBeVisible();
  await main.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Enable expenses', exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Payment allocation', { exact: true })).toHaveValue('proportional');
  await page.getByRole('switch', { name: 'Enable expenses', exact: true }).check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await main.getByRole('link', { name: 'Expenses', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Client collection trip' })).toBeVisible();
});

test('expense types, corrections, history and voids update live consolidation', async ({ page }) => {
  await page.goto('/tests/fixtures/accounting.html?route=/expenses');
  await page.locator('.expense-types summary').click();
  await page.getByRole('button', { name: 'Add expense type', exact: true }).click();
  await page.getByLabel('Type name', { exact: true }).fill('Office rent');
  await page.getByRole('button', { name: 'Save type', exact: true }).click();
  await page.getByRole('button', { name: 'Record expense', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Expense type', { exact: true }).selectOption({ label: 'Office rent' });
  await dialog.getByLabel('Amount (PHP)', { exact: true }).fill('100');
  await dialog.getByLabel('Description', { exact: true }).fill('November rent');
  await dialog.getByRole('button', { name: 'Record expense', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'November rent' });
  await expect(row).toContainText('₱100.00');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount (PHP)', { exact: true }).fill('150');
  await dialog.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(row).toContainText('₱150.00');
  await row.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Revision 2');
  await expect(page.getByRole('dialog')).toContainText('Revision 1');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await row.getByRole('button', { name: 'Void', exact: true }).click();
  await page.getByLabel('Void reason', { exact: true }).fill('Duplicate entry');
  await page.getByRole('dialog').getByRole('button', { name: 'Void expense', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByLabel('Expense status', { exact: true }).selectOption('void');
  await expect(row).toContainText('Duplicate entry');
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Consolidation', exact: true }).click();
  const net = page.getByLabel('Consolidation totals').locator('.ledger-stat').filter({ has: page.locator('.stat-label', { hasText: /^Net income$/ }) });
  await expect(net.locator('.stat-value')).toHaveText('₱250.00');
});

test('direct expense access redirects when disabled; unconfirmed data does not produce false net income', async ({ page }) => {
  await page.goto('/tests/fixtures/accounting.html?route=/expenses&disabled=1');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Expenses', exact: true })).toHaveCount(0);
  await page.goto('/tests/fixtures/accounting.html?offline=1');
  await expect(page.getByRole('alert')).toContainText('Expense-adjusted totals are unavailable');
  const cards = page.getByLabel('Consolidation totals');
  await expect(cards.getByText('Unavailable', { exact: true })).toHaveCount(3);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Expenses', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record expense', exact: true })).toBeDisabled();
});

test('expense and settings pages support narrow light and dark layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('mcl:preferences:theme', value), theme);
    await page.goto('/tests/fixtures/accounting.html?route=/expenses');
    await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.tmp/expenses-mobile-${theme}.png`, fullPage: true });
    await page.goto('/tests/fixtures/accounting.html?route=/settings');
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: /Collections & expenses/ }).click();
    await expect(page.getByRole('switch', { name: 'Enable expenses', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.tmp/settings-accounting-mobile-${theme}.png`, fullPage: true });
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: /Consolidation metrics/ }).click();
    const metrics = page.locator('#settings-consolidation');
    await expect(metrics.getByRole('switch')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await metrics.screenshot({ path: `.tmp/settings-metrics-mobile-${theme}.png` });
  }
});
