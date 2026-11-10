import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test('all document defaults and reset options produce A4 Word and standalone HTML exports', async ({ page }) => {
  // Exercise local fixture contexts and exported files without contacting Firebase.
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
  await page.goto('/tests/fixtures/print-studio.html?term30=1');

  for (const [title, width, height, orientation] of [
    ['Index Card', 297, 210, 'landscape'],
    ['Promissory Note', 210, 297, 'portrait'],
    ['Daily Summary Sheet', 297, 210, 'landscape'],
  ] as const) {
    await page.getByRole('tab', { name: title, exact: true }).click();
    const paper = page.getByLabel('Paper size', { exact: true });
    await expect(paper).toHaveValue('a4');
    await paper.selectOption('letter');
    await expect(paper).toHaveValue('letter');
    await page.getByRole('button', { name: 'Reset print options', exact: true }).click();
    await expect(paper).toHaveValue('a4');
    await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();

    const pendingWord = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
    const word = await pendingWord;
    const parts = unzipSync(new Uint8Array(await readFile((await word.path())!)));
    const xml = strFromU8(parts['word/document.xml']);
    const pageSizes = xml.match(/<w:pgSz\b[^>]*\/>/g);
    expect(pageSizes?.length).toBeGreaterThan(0);
    for (const pageSize of pageSizes!) {
      expect(pageSize).toContain(`w:w="${Math.round(width / 25.4 * 1440)}"`);
      expect(pageSize).toContain(`w:h="${Math.round(height / 25.4 * 1440)}"`);
      expect(pageSize).toContain(`w:orient="${orientation}"`);
    }

    const pendingHtml = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export HTML', exact: true }).click();
    const html = await pendingHtml;
    const standalone = await readFile((await html.path())!, 'utf8');
    expect(standalone).toContain(`@page{size:${width}mm ${height}mm;margin:0}`);
    expect(standalone).toContain('data:image/png;base64,');
  }
});
