import assert from 'node:assert/strict';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
 for (const width of [360, 768]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto('http://127.0.0.1:4180/index-test.html');
  const frame = page.frameLocator('iframe[title="Web index card"]');
  await frame.getByRole('heading', {name:'MCL FIXTURE LENDING'}).waitFor();
  assert.equal(await frame.locator('.index-grid tr').count(),12);
  assert.equal(await frame.locator('.signature-line').count(),45);
  assert.equal(await frame.locator('.index-entry').first().locator('span').first().innerText(),'250.00');
  assert.equal(await frame.locator('.index-heading img').evaluate(img=>img.complete && img.naturalWidth > 0),true);
  assert.equal(await page.getByLabel('Card zoom').innerText(), '125%');
  assert.ok(await page.locator('.index-scroll').evaluate(el => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight));
  await page.locator('.index-scroll').evaluate(el => { el.scrollLeft = 250; el.scrollTop = 80; });
  assert.ok(await page.locator('.index-scroll').evaluate(el => el.scrollLeft > 0 && el.scrollTop > 0));
  await page.locator('.index-scroll').evaluate(el => { el.scrollLeft = 0; el.scrollTop = 0; });
  const bounds = await page.locator('.index-scroll').boundingBox();
  assert.ok(bounds && bounds.height >= 240 && bounds.width > 200);
  await page.screenshot({path:'../.tmp/web-index-'+width+'.png'});
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.getByRole('button',{name:'100%',exact:true}).click();
  assert.ok(await page.locator('.index-scroll').evaluate(el=>el.scrollWidth > el.clientWidth));
  await page.getByRole('button',{name:'Simulate live payment'}).click();
  await frame.locator('.index-entry').first().locator('span').first().filter({hasText:'500.00'}).waitFor();
  await page.getByRole('button',{name:'58 day loan'}).click();
  await frame.locator('.index-grid tr').nth(14).waitFor();
  assert.equal(await frame.locator('.signature-line').count(),58);
  await page.getByRole('button',{name:'Fit',exact:true}).click();
  assert.ok(await page.locator('.index-scroll').evaluate(el=>el.scrollWidth <= el.clientWidth+1));
  console.log('PASS: website card, logo, 45/58 days, live payment, fit and zoom at '+width+'px');
  await page.close();
 }
} finally { await browser.close(); }
