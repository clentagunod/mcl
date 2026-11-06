import { chromium } from '../../../web/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [360, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4178', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Account sign in' }).waitFor();
    await page.getByLabel('Email', { exact: true }).fill('test@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-only-never-submitted');
    const bounds = await page.locator('.auth-card').boundingBox();
    if (!bounds || Math.abs(bounds.x + bounds.width / 2 - width / 2) > 2 || Math.abs(bounds.y + bounds.height / 2 - 400) > 2) throw new Error('Login card is not centered: ' + JSON.stringify(bounds));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow || errors.length) throw new Error(JSON.stringify({ width, overflow, errors }));
    await page.screenshot({ path: '../.tmp/login-' + width + '.png', fullPage: true });
    console.log('PASS: login renders, fields work, no page errors or overflow at ' + width + 'px');
    await page.close();
  }
} finally { await browser.close(); }
