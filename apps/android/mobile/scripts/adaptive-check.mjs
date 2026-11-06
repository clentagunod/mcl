import assert from 'node:assert/strict';
import {chromium} from '../../../web/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:360,height:800}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4181/adaptive-test.html');
 await page.getByLabel('Find a client').fill('Borrower');
 const sizes=[{width:320,height:700},{width:600,height:800},{width:840,height:900},{width:1280,height:800},{width:720,height:360},{width:360,height:800}];
 for(const size of sizes){
  await page.setViewportSize(size);
  assert.equal(await page.getByLabel('Find a client').inputValue(),'Borrower');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const cards=await page.locator('.client-card').count(); assert.equal(cards,6);
 }
 await page.getByRole('button',{name:'Add payment',exact:true}).first().click();
 await page.getByLabel('Amount collected (₱)',{exact:true}).fill('123.45');
 for(const size of sizes){
  await page.setViewportSize(size);
  const dialog=page.getByRole('dialog');
  const bounds=await dialog.boundingBox();
  assert.ok(bounds && bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=size.width+1 && bounds.y+bounds.height<=size.height+1);
  assert.equal(await page.getByLabel('Amount collected (₱)',{exact:true}).inputValue(),'123.45');
  await dialog.getByRole('button',{name:'Save payment',exact:true}).scrollIntoViewIfNeeded();
  const save=await dialog.getByRole('button',{name:'Save payment',exact:true}).boundingBox();
  assert.ok(save && save.y>=0 && save.y+save.height<=size.height+1);
 }
 await page.locator('.mcl-dialog-header button[aria-label="Close"]').click();
 await page.getByRole('button',{name:'Switch role'}).click();
 for(const size of sizes){
  await page.setViewportSize(size);
  const nav=page.getByRole('navigation',{name:'Main'});
  const direction=await nav.evaluate(el=>getComputedStyle(el).flexDirection);
  assert.equal(direction,size.width>=840?'column':'row');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'../.tmp/adaptive-'+size.width+'x'+size.height+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: collector/admin layouts at 320, 360, 600, 840, 1280px; short landscape; search and payment drafts retained through resize; reachable save; no page overflow/errors.');
}finally{await browser.close();}
