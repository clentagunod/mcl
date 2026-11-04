import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

test('settings section navigation and direct links keep every setting accessible', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=settings#settings-trash');
  const navigation = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(navigation.getByRole('link')).toHaveCount(6);
  await expect(page.getByLabel('Automatically delete Trash', { exact: true })).toBeInViewport();
  await navigation.getByRole('link', { name: /Print defaults/ }).click();
  await expect(page.locator('#settings-studio')).toBeInViewport();
  await navigation.getByRole('link', { name: /General/ }).click();
  await expect(page.getByLabel('Website name', { exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeVisible();
});

test('calendar selection fills the holiday form and saving updates the calendar', async ({ page }) => {
  const saved: { date: string; name: string }[] = [];
  await page.route('**/src/services/holidays.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function saveHoliday(holiday) {
      const response = await fetch('/test-api/holidays', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(holiday) });
      if (!response.ok) throw new Error('Unable to save holiday');
      window.dispatchEvent(new CustomEvent('fixture:holiday-saved', { detail: holiday }));
    }
    export async function deleteHoliday() {}
  ` }));
  await page.route('**/test-api/holidays', async route => {
    saved.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.goto('/tests/fixtures/holidays.html');
  await page.getByRole('button', { name: 'Nov 12, 2026', exact: true }).click();
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-11-12');
  await page.getByLabel('Holiday name', { exact: true }).fill('Team planning day');
  await page.getByRole('button', { name: 'Add holiday', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Team planning day added for Nov 12, 2026.');
  expect(saved).toEqual([{ date: '2026-11-12', name: 'Team planning day' }]);
  await expect(page.getByRole('button', { name: 'Nov 12, 2026, Team planning day', exact: true })).toHaveClass(/has-holiday/);
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'December 2026', exact: true })).toBeVisible();
});

test('holiday search and date filters combine without changing saved records', async ({ page }) => {
  await page.goto('/tests/fixtures/holidays.html');
  await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.locator('.holiday-list tbody tr')).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Search holidays' }).fill('Christmas');
  await expect(page.locator('.holiday-list tbody tr')).toHaveCount(1);
  await expect(page.locator('.holiday-list tbody')).toContainText('Christmas Day');
  await page.getByRole('button', { name: 'Past', exact: true }).click();
  await expect(page.getByText('No holidays match your search or date filter.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search holidays' }).clear();
  await expect(page.locator('.holiday-list tbody tr')).toHaveCount(1);
  await expect(page.locator('.holiday-list tbody')).toContainText('All Saints Day');
});
