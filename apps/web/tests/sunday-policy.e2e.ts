import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-02T12:00:00+08:00') });
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  await page.route('**/src/services/settings.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { DEFAULT_SETTINGS } from '/src/config/settings.ts';
    const key = 'fixture-sunday-settings';
    const read = () => JSON.parse(localStorage.getItem(key) || 'null') || structuredClone(DEFAULT_SETTINGS);
    export function subscribeSettings(onData) {
      const update = event => {
        const next = { ...read(), schedule: { skipSundays: event.detail } };
        localStorage.setItem(key, JSON.stringify(next));
        onData(next);
      };
      onData(read());
      window.addEventListener('fixture:sunday-policy', update);
      return () => window.removeEventListener('fixture:sunday-policy', update);
    }
    export async function initializeSettings() {}
    export async function saveSettings(settings, uid, expected) {
      const response = await fetch('/test-api/sunday-settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings, uid, expected }) });
      if (!response.ok) throw new Error('Schedule save unavailable');
      localStorage.setItem(key, JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent('fixture:sunday-policy', { detail: settings.schedule.skipSundays }));
    }
  ` }));
  await page.route('**/src/services/clients.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export function subscribeClients(onData) { onData([{ id: 'fixture-client', clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Juan', middleName: '', lastName: 'Cruz', address: 'Tagum', cellphone: '', principal: 10000, interest: 1250, dailyAmount: 375, loanTermDays: 30, approvalDate: '2026-10-01' }]); return () => {}; }
    export async function completeClientRecords() {}
  ` }));
  await page.route('**/src/services/payments.ts', route => route.fulfill({ contentType: 'text/javascript', body: 'export function subscribePayments(onData) { onData([]); return () => {}; }' }));
  await page.route('**/src/services/collectors.ts', route => route.fulfill({ contentType: 'text/javascript', body: 'export function subscribeCollectors(onData) { onData([]); return () => {}; }' }));
  await page.route('**/src/services/holidays.ts', route => route.fulfill({ contentType: 'text/javascript', body: `export function subscribeHolidays(onData) { onData([{ date: '2026-10-05', name: 'Registered holiday' }]); return () => {}; }` }));
});

test('saving and reloading Sunday policy updates the real providers, loan status and printed due date', async ({ page }) => {
  const saved: { settings: { schedule: { skipSundays: boolean } }; expected: { schedule: { skipSundays: boolean } }; uid: string }[] = [];
  await page.route('**/test-api/sunday-settings', async route => {
    saved.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.goto('/tests/fixtures/sunday-policy.html#settings-schedule');
  const toggle = page.getByRole('checkbox', { name: 'Skip Sundays when counting loan days', exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByLabel('Loan due date', { exact: true })).toHaveText('2026-11-01');
  await expect(page.getByLabel('Loan status', { exact: true })).toHaveText('due');
  await toggle.check();
  // Draft changes are local until a successful save.
  await expect(page.getByLabel('Loan due date', { exact: true })).toHaveText('2026-11-01');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByLabel('Loan due date', { exact: true })).toHaveText('2026-11-06');
  await expect(page.getByLabel('Loan status', { exact: true })).toHaveText('pending');
  await expect(page.getByLabel('Elapsed loan days', { exact: true })).toHaveText('26');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ uid: 'fixture-admin', settings: { schedule: { skipSundays: true } }, expected: { schedule: { skipSundays: false } } });
  await page.reload();
  await expect(toggle).toBeChecked();
  await expect(page.getByLabel('Loan due date', { exact: true })).toHaveText('2026-11-06');
  await page.getByRole('button', { name: 'Open print studio', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('.index-due-date')).toHaveText('Due date: Nov 6, 2026');
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await toggle.uncheck();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByLabel('Loan due date', { exact: true })).toHaveText('2026-11-01');
  await expect(page.getByLabel('Loan status', { exact: true })).toHaveText('due');
  expect(saved[1]).toMatchObject({ settings: { schedule: { skipSundays: false } }, expected: { schedule: { skipSundays: true } } });
  await page.reload();
  await expect(toggle).not.toBeChecked();
});

test('failed saves preserve the active schedule and remote changes cannot be overwritten by an old draft', async ({ page }) => {
  await page.route('**/test-api/sunday-settings', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/tests/fixtures/sunday-policy.html#settings-schedule');
  const toggle = page.getByRole('checkbox', { name: 'Skip Sundays when counting loan days', exact: true });
  await toggle.check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Schedule save unavailable');
  await expect(page.getByLabel('Loan due date', { exact: true })).toHaveText('2026-11-01');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:sunday-policy', { detail: true })));
  await expect(page.getByLabel('Loan due date', { exact: true })).toHaveText('2026-11-06');
  await expect(page.locator('.alert[role="status"]')).toContainText('Settings changed in another session.');
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
  await expect(toggle).toBeChecked();
});
