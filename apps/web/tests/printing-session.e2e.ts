import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

test.skip(!process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Run npm run test:printing-session with the isolated Auth and Firestore emulators.');
let environment: RulesTestEnvironment;
let uid: string;
const email = 'printing-admin@example.test';
const password = 'Printing-test-only-123';

test.beforeAll(async () => {
  expect(process.env.GCLOUD_PROJECT).toBe('demo-mcl-printing');
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099');
  environment = await initializeTestEnvironment({ projectId: 'demo-mcl-printing', firestore: {
    host: '127.0.0.1', port: 8188, rules: await readFile('firestore.rules', 'utf8'),
  } });
  const result = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-printing-key', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  expect(result.ok).toBe(true); uid = (await result.json()).localId;
});
test.afterAll(async () => { await environment?.cleanup(); });
test.beforeEach(async ({ context }) => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async admin => {
    const db = admin.firestore();
    await Promise.all([
      setDoc(doc(db, 'settings/Printables/elements/summaryTemplate'), { onlyClientsWithPayments: false }),
      setDoc(doc(db, 'users', uid), { role: 'admin', active: true, fullName: 'Printing Administrator', email, phone: '' }),
      setDoc(doc(db, 'clients/mcl0001'), { clientNumber: 'mcl0001', transactionNumber: '00001',
        firstName: 'Juan', middleName: '', lastName: 'Cruz', address: 'Tagum City', cellphone: '',
        principal: 10000, interest: 1250, dailyAmount: 250, loanTermDays: 45, approvalDate: '2026-11-01' }),
    ]);
  });
  await context.route('**/src/config/firebase.ts*', route => route.fulfill({ contentType: 'text/javascript', body: "export { auth, db, getProvisioningAuth } from '/tests/fixtures/printing-session-firebase.ts';" }));
  await context.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

async function signIn(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function openStudio(page: Page, context: BrowserContext) {
  await page.goto('/login'); await signIn(page);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Printables', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Printables', exact: true })).toBeVisible();
  const launch = page.getByRole('link', { name: 'Go to another page for printing', exact: true });
  await expect(launch).toHaveAttribute('target', '_blank');
  await expect(page.locator('iframe')).toHaveCount(0);
  const opened = context.waitForEvent('page'); await launch.click();
  const studio = await opened;
  await expect(studio.getByRole('heading', { name: 'Print Studio', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(studio.getByRole('button', { name: 'Print', exact: true })).toBeEnabled({ timeout: 20_000 });
  return studio;
}

test('main navigation preserves the separate studio, and Firebase logout clears every printing tab', async ({ page, context }) => {
  await environment.withSecurityRulesDisabled(admin => setDoc(doc(admin.firestore(), 'settings/Printables/elements/promissoryTemplate'), { includeIdPage: true }));
  const studio = await openStudio(page, context);
  await expect(page).toHaveURL(/\/printables$/);
  await expect(studio).toHaveURL(/\/print-studio$/);
  expect(await studio.evaluate(() => window.opener)).toBeNull();
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Print', exact: true })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'Print', exact: true })).toHaveAttribute('href', '/print-studio?client=mcl0001');
  await studio.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await studio.getByLabel('Font family', { exact: true }).selectOption('Georgia');
  await studio.getByLabel('ID image file', { exact: true }).setInputFiles({ name: 'temporary-id.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64') });
  await expect(studio.frameLocator('iframe').locator('.print-artwork')).toHaveCount(1);
  const another = await context.newPage(); await another.goto('/print-studio?client=mcl0001');
  await expect(another.getByRole('heading', { name: 'Print Studio', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  for (const printing of [studio, another]) {
    await expect(printing).toHaveURL(/\/login$/, { timeout: 20_000 });
    await expect(printing.getByRole('status')).toContainText('Your printing session has ended');
    await expect(printing.locator('iframe')).toHaveCount(0);
    await expect(printing.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
  }
  // A later sign-in cannot resurrect the old in-memory images or typography.
  await signIn(page);
  await expect(studio.getByRole('heading', { name: 'Print Studio', exact: true })).toBeVisible({ timeout: 20_000 });
  await studio.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await expect(studio.getByLabel('Font family', { exact: true })).toHaveValue('Template font');
  await expect(studio.frameLocator('iframe').locator('.print-artwork')).toHaveCount(0);
});

test('direct printing links require sign-in and return to the requested client', async ({ page }) => {
  await page.goto('/print-studio?client=mcl0001');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Your printing session has ended', { exact: false })).toHaveCount(0);
  await signIn(page);
  await expect(page).toHaveURL(/\/print-studio\?client=mcl0001$/);
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Print Studio', exact: true })).toBeVisible();
  await page.goto('/printables?client=mcl0001');
  await expect(page.getByRole('link', { name: 'Go to another page for printing', exact: true })).toHaveAttribute('href', '/print-studio?client=mcl0001');
  await expect(page.getByText('Ready to prepare documents for', { exact: false })).toContainText('Juan Cruz');
});

test('fullscreen fitting, fixed tools and mobile drawers avoid whole-page scrolling', async ({ page, context }) => {
  const studio = await openStudio(page, context);
  await studio.setViewportSize({ width: 1366, height: 768 });
  const canvas = studio.locator('.editor-canvas');
  await expect(studio.getByLabel('Zoom', { exact: true })).toHaveValue('75');
  await expect.poll(() => canvas.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await expect(studio.locator('.editor-statusbar')).toBeInViewport();
  await expect.poll(() => studio.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  for (const title of ['Index Card', 'Promissory Note', 'Daily Summary Sheet']) {
    await studio.getByRole('tab', { name: title, exact: true }).click();
    await studio.getByRole('button', { name: 'Fit page to screen', exact: true }).click();
    await expect.poll(async () => {
      const paper = await studio.frameLocator('iframe').locator('.sheet').first().boundingBox();
      const space = await canvas.boundingBox();
      return !!paper && !!space && paper.width <= space.width && paper.height <= space.height;
    }).toBe(true);
  }
  const before = (await canvas.boundingBox())!.height;
  await studio.getByRole('button', { name: 'Collapse ribbon', exact: true }).click();
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(before + 50);
  await expect(studio.getByRole('button', { name: 'Print', exact: true })).toBeInViewport();
  await studio.getByRole('button', { name: 'Expand ribbon', exact: true }).click();
  await studio.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await studio.screenshot({ path: '.tmp/fullscreen-printing-desktop.png', fullPage: true });
  await studio.setViewportSize({ width: 390, height: 844 });
  await expect(studio.getByRole('complementary', { name: 'Client selection', exact: true })).toHaveCount(0);
  await expect.poll(() => studio.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await studio.getByRole('button', { name: 'Toggle clients panel', exact: true }).click();
  await expect(studio.getByRole('searchbox', { name: 'Search clients', exact: true })).toBeVisible();
  await studio.getByRole('button', { name: 'Close clients panel', exact: true }).click();
  await studio.getByRole('button', { name: 'Toggle pictures panel', exact: true }).click();
  await expect(studio.getByLabel('Image belongs to', { exact: true })).toBeVisible();
  await studio.getByLabel('E-signature file', { exact: true }).setInputFiles({ name: 'session-signature.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64') });
  await expect(studio.getByRole('tab', { name: 'Position', exact: true })).toHaveAttribute('aria-selected', 'true');
  await studio.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await expect(studio.getByLabel('Rotation (degrees)', { exact: true })).toBeVisible();
  await studio.getByRole('tab', { name: 'Position', exact: true }).click();
  await expect(studio.getByLabel('Image width (mm)', { exact: true })).toBeVisible();
  await studio.getByRole('button', { name: 'Close pictures panel', exact: true }).click();
  await expect(studio.locator('.editor-statusbar')).toBeInViewport();
  await studio.screenshot({ path: '.tmp/fullscreen-printing-mobile.png', fullPage: true });
});
