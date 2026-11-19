import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

async function downloadWord(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  return strFromU8(files['word/document.xml']);
}

async function wordIndexSheets(page: Page, xml: string) {
  return page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const sheets = [...doc.getElementsByTagNameNS(ns, 'body')[0].children].filter(element => element.localName === 'tbl');
    const sizes = [...doc.getElementsByTagNameNS(ns, 'pgSz')].map(element => ({
      width: Number(element.getAttributeNS(ns, 'w')),
      height: Number(element.getAttributeNS(ns, 'h')),
      orientation: element.getAttributeNS(ns, 'orient'),
    }));
    return {
      sizes,
      sheets: sheets.map(sheet => [...sheet.children].filter(element => element.localName === 'tr').map(row => ({
        text: [...row.getElementsByTagNameNS(ns, 't')].map(text => text.textContent).join(''),
        height: Number(row.getElementsByTagNameNS(ns, 'trHeight')[0].getAttributeNS(ns, 'val')),
        unsplittable: row.getElementsByTagNameNS(ns, 'cantSplit').length > 0,
      }))),
    };
  }, xml);
}

test('Word keeps one, two or three selected index cards on the same velum sheet', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?comaker=1');
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  for (const count of [1, 2, 3]) {
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    for (let index = 1; index <= count; index++) {
      await page.getByRole('checkbox', { name: new RegExp(`Select .*\\(mcl000${index}\\)`) }).check();
    }
    await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
    const xml = await downloadWord(page);
    const document = await wordIndexSheets(page, xml);
    expect(document.sizes).toEqual([{ width: 12240, height: 18720, orientation: 'portrait' }]);
    expect(document.sheets).toHaveLength(1);
    expect(document.sheets[0]).toHaveLength(count);
    expect(document.sheets[0].every(card => card.unsplittable && card.height > 6000 && card.height < 6200)).toBe(true);
    expect(document.sheets[0][0].text).toContain('Name: Juan Santos Dela Cruz/Maria Reyes');
    expect(document.sheets[0][0].text).toContain('Due date:');
    if (count >= 2) {
      expect(document.sheets[0][1].text).toContain('Name: Juan Santos Reyes');
      expect(document.sheets[0][1].text).not.toContain('Reyes/');
    }
    if (count === 3) expect(document.sheets[0][2].text).toContain('58.');
    expect(xml).not.toContain('{{');
  }
});

test('Word starts a new velum sheet after the third selected index card', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?many=1');
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  for (let index = 1; index <= 4; index++) {
    await page.getByRole('searchbox', { name: 'Search clients', exact: true }).fill(`mcl000${index}`);
    await page.getByRole('checkbox', { name: new RegExp(`Select .*\\(mcl000${index}\\)`) }).check();
  }
  const document = await wordIndexSheets(page, await downloadWord(page));
  expect(document.sheets.map(sheet => sheet.length)).toEqual([3, 1]);
  expect(document.sizes).toHaveLength(2);
  expect(document.sizes.every(size => size.width === 12240 && size.height === 18720 && size.orientation === 'portrait')).toBe(true);
  expect(document.sheets.flat().map(card => card.text.match(/mcl\d{4}/)?.[0]).sort()).toEqual(['mcl0001', 'mcl0002', 'mcl0003', 'mcl0004']);
});

test('Word uses the joint name only in the promissory opening and omits blank co-makers', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?comaker=1');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  for (const index of [1, 2]) {
    await page.getByRole('radio', { name: new RegExp(`Select .*\\(mcl000${index}\\)`) }).check();
    const xml = await downloadWord(page);
    const text = await page.evaluate(source => {
      const doc = new DOMParser().parseFromString(source, 'application/xml');
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const paragraphs = [...doc.getElementsByTagNameNS(ns, 'p')].map(paragraph => [...paragraph.getElementsByTagNameNS(ns, 't')].map(run => run.textContent).join(''));
      return { opening: paragraphs.find(paragraph => paragraph.startsWith('FOR VALUE')), paragraphs };
    }, xml);
    expect(text.opening).toContain(index === 1 ? 'JUAN SANTOS DELA CRUZ/MARIA REYES' : 'JUAN SANTOS REYES');
    if (index === 1) expect(text.paragraphs).toContain('JUAN SANTOS DELA CRUZ');
    else expect(text.opening).not.toMatch(/REYES\/|N\/A/);
    expect(xml).not.toContain('{{');
  }
});
