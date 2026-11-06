import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, page }) => {
  await context.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
});

test('login supports password visibility, keyboard submission, and recoverable sign-in errors', async ({ page }) => {
  await page.goto('/tests/fixtures/login.html');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('fixture-password');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await password.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Sign-in could not be completed');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(password).toHaveValue('fixture-password');
});

for (const width of [1440, 390, 320]) {
  test(`public pages fit at ${width}px and support the shared theme and credit link`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/tests/fixtures/login.html', '/maintenance']) {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      const footer = page.getByRole('contentinfo');
      await expect(footer).toContainText('© MCL Lending App');
      await expect(footer).toContainText('Courtesy of');
      await expect(footer.getByRole('link', { name: 'ClentIndustries' })).toHaveAttribute('href', 'https://clentindustries.vercel.app');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.screenshot({ path: `.tmp/${route.includes('login') ? 'login' : 'maintenance'}-${width}-dark.png`, fullPage: true });
      await page.getByRole('button', { name: 'Switch to light mode' }).click();
      await page.screenshot({ path: `.tmp/${route.includes('login') ? 'login' : 'maintenance'}-${width}-light.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test('login stays within the viewport before and after sign-in errors at desktop, mobile, and landscape sizes', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 720], [768, 1024], [390, 844], [375, 667], [320, 568], [844, 390], [568, 320]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/tests/fixtures/login.html');
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();

    async function expectOneScreen() {
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.scrollingElement!.scrollHeight,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      }));
      expect(dimensions.width, `${width}x${height}: horizontal overflow`).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
      expect(dimensions.height, `${width}x${height}: vertical overflow`).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
      const panel = (await page.locator('.login-panel').boundingBox())!;
      const form = (await page.locator('.login-form').boundingBox())!;
      const footer = (await page.getByRole('contentinfo').boundingBox())!;
      expect(form.y, `${width}x${height}: form stays inside the panel`).toBeGreaterThanOrEqual(panel.y);
      expect(form.y + form.height, `${width}x${height}: form stays inside the panel`).toBeLessThanOrEqual(panel.y + panel.height);
      expect(panel.y + panel.height, `${width}x${height}: panel clears the footer`).toBeLessThanOrEqual(footer.y);
      for (const control of [page.getByLabel('Email', { exact: true }), page.getByLabel('Password', { exact: true }), page.getByRole('button', { name: 'Sign in', exact: true }), page.getByRole('contentinfo')]) {
        await expect(control).toBeInViewport({ ratio: 1 });
      }
    }

    await expectOneScreen();
    await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expectOneScreen();
    if (width === 1366 || width === 375 || width === 568) {
      await page.screenshot({ path: `.tmp/login-fit-${width}x${height}.png` });
    }
  }
});

test('maintenance preview renders without starting Firebase', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/maintenance/');
  await expect(page.getByRole('heading', { name: 'We’ll be back shortly.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(requests.some(url => /googleapis\.com|firebaseio\.com|\/src\/config\/firebase\.ts|\/src\/App\.tsx/.test(url))).toBe(false);
});
