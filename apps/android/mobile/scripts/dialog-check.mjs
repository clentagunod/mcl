import { chromium } from '../../../web/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{width:360,height:760},{width:360,height:380},{width:768,height:800}]) {
    const page = await browser.newPage({ viewport });
    await page.goto(process.env.DIALOG_URL || 'http://127.0.0.1:4178/dialog-test.html');
    for (let attempt=0; attempt<2; attempt++) {
      await page.getByRole('button',{name:'Add payment',exact:true}).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      if (!bounds || bounds.height < 200 || bounds.width < 250 || bounds.x < 0 || bounds.y < 0 || bounds.y+bounds.height > viewport.height+1) throw new Error('Invalid dialog bounds: '+JSON.stringify(bounds));
      await dialog.getByLabel('Amount',{exact:true}).fill('123.45');
      await dialog.getByRole('button',{name:'Save payment',exact:true}).scrollIntoViewIfNeeded();
      const save = await dialog.getByRole('button',{name:'Save payment',exact:true}).boundingBox();
      if (!save || save.y < 0 || save.y+save.height > viewport.height) throw new Error('Save button inaccessible');
      await page.screenshot({path:'../.tmp/dialog-'+viewport.width+'-'+viewport.height+'.png'});
      await dialog.getByRole('button',{name:'Close',exact:true}).click();
      if (await page.getByRole('dialog').count()) throw new Error('Dialog did not close');
    }
    console.log('PASS: open, enter amount, scroll to save, close and reopen at '+viewport.width+'x'+viewport.height);
    await page.close();
  }
} finally { await browser.close(); }
