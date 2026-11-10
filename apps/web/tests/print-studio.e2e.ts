import { test, expect } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  // Tests must never contact live authentication/database services.
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, (route) => route.abort());
});

test('index due date matches client loan information and survives HTML and Word exports', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=clients&holiday=1');
  const clientDueDate = (await page.locator('.client-schedule strong').first().innerText()).replace(/^Due /, '');
  await page.goto('/tests/fixtures/print-studio.html?holiday=1');
  await expect(page.frameLocator('iframe').locator('.index-due-date')).toHaveText(`Due date: ${clientDueDate}`);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();

  const wordPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const word = await wordPending;
  const files = unzipSync(new Uint8Array(await readFile((await word.path())!)));
  expect(strFromU8(files['word/document.xml'])).toContain(`Due date: ${clientDueDate}`);

  const htmlPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click();
  const html = await htmlPending;
  expect(await readFile((await html.path())!, 'utf8')).toContain(`Due date: <b>${clientDueDate}</b>`);
});

test('index template, sequential paying days, all terms and reset controls', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  const frame = page.frameLocator('iframe');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  await expect(frame.locator('.index-entry')).toHaveCount(45);
  await expect(frame.locator('.index-entry').first()).toContainText('250.00');
  await expect(frame.locator('.index-entry').nth(4)).toContainText('500.00'); // column-major ordering: row 2, first column
  await expect(frame.locator('.signature-line').first()).toBeEmpty();
  await page.getByRole('searchbox', { name: 'Search clients' }).fill('mcl0002');
  await page.getByRole('radio', { name: /Select .*\(mcl0002\)/ }).check();
  await expect(frame.locator('.index-entry')).toHaveCount(50);
  await page.getByRole('searchbox', { name: 'Search clients' }).fill('mcl0003');
  await page.getByRole('radio', { name: /Select .*\(mcl0003\)/ }).check();
  await expect(frame.locator('.index-entry')).toHaveCount(58);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  await page.getByLabel('Size grid').uncheck();
  await expect(page.locator('.studio-workspace')).not.toHaveClass(/with-grid/);
  await page.getByRole('button', { name: 'Reset print options' }).click();
  await expect(page.getByLabel('Size grid')).toBeChecked();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const download = await pending;
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const xml = strFromU8(files['word/document.xml']);
  expect(xml).toContain('BORROWER’S COPY');
  expect(xml).toContain('58.');
  expect(xml).toMatch(/w:fill="a1bfcd"/i);
  expect(xml).toContain('mcl0003');
  await page.screenshot({ path: '.tmp/index-studio.png', fullPage: true });
});

test('promissory preview and real DOCX retain template fields and blank IDs', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Promissory Note' }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.promissory-sheet')).toContainText('JUAN SANTOS DELA CRUZ');
  await expect(frame.locator('.promissory-sheet')).toContainText('CRISTOPHER A. LASARTE');
  await expect(frame.locator('.promissory-sheet')).not.toContainText('NATIONAL ID');
  await expect(frame.locator('.note-id-boxes')).toHaveCount(0);
  await expect(frame.locator('.note-p-22')).toHaveCSS('text-align', 'center');
  await expect(frame.locator('.note-p-22')).toHaveCSS('font-family', '"Bell MT"');
  await expect(frame.locator('.note-p-23')).toHaveCSS('text-align', 'center');
  await expect(frame.locator('.note-p-22')).toHaveText('ACKNOWLEDGEMENT');
  const spacing = await frame.locator('.note-p-5').evaluate((node) => {
    const style = getComputedStyle(node);
    return { line: parseFloat(style.lineHeight) / parseFloat(style.fontSize), gap: parseFloat(style.marginBottom) };
  });
  expect(spacing.line).toBeCloseTo(1.18, 2);
  expect(spacing.gap).toBeGreaterThan(2);
  const metadata = await frame.locator('.note-metadata').evaluate((row) => ({
    right: row.getBoundingClientRect().right,
    dateRight: row.lastElementChild!.getBoundingClientRect().right,
    amountLeft: row.firstElementChild!.getBoundingClientRect().left,
    left: row.getBoundingClientRect().left,
  }));
  expect(metadata.dateRight).toBeCloseTo(metadata.right, 0);
  expect(metadata.amountLeft).toBeCloseTo(metadata.left, 0);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const xml = strFromU8(files['word/document.xml']);
  expect(xml).toContain('JUAN SANTOS DELA CRUZ');
  expect(xml).toContain('October 20, 2026');
  expect(xml).not.toMatch(/\{\{|ARNAIZ|NATIONAL ID|2739-4913/);
  expect(xml).not.toMatch(/<w:t[^>]*>(?:CO-MAKER|DEBTOR)<\/w:t>/);
  const headings = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    return [...document.getElementsByTagNameNS(ns, 'p')].flatMap((paragraph) => {
      const text = [...paragraph.getElementsByTagNameNS(ns, 't')].map((t) => t.textContent).join('');
      if (!['ACKNOWLEDGEMENT', 'REPUBLIC OF THE PHILIPPINES'].includes(text)) return [];
      return [{ text, alignment: paragraph.getElementsByTagNameNS(ns, 'jc')[0]?.getAttributeNS(ns, 'val') }];
    });
  }, xml);
  expect(headings).toEqual([{ text: 'ACKNOWLEDGEMENT', alignment: 'center' }, { text: 'REPUBLIC OF THE PHILIPPINES', alignment: 'center' }]);
  expect(xml).toContain('w:after="40" w:line="283"');
  const signatureRows = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const table = [...document.getElementsByTagNameNS(ns, 'tbl')].find((node) => node.textContent?.includes('Co-Maker Signature'))!;
    return [...table.getElementsByTagNameNS(ns, 'tr')].map((row) => [...row.getElementsByTagNameNS(ns, 'tc')].map((cell) => ({
      text: [...cell.getElementsByTagNameNS(ns, 't')].map((text) => text.textContent).join(''),
      width: cell.getElementsByTagNameNS(ns, 'tcW')[0].getAttributeNS(ns, 'w'),
    })));
  }, xml);
  expect(signatureRows).toHaveLength(6);
  expect(signatureRows.every((row) => row.length === 2 && row[0].width === row[1].width)).toBe(true);
  expect(signatureRows[1].map((cell) => cell.text)).toEqual(['Co-Maker Signature over Printed Name', 'Debtor/Borrower Signature']);
  expect(Object.keys(files).filter((name) => name.startsWith('word/media/'))).toEqual(['word/media/mcl-logo.png']);
  const htmlPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML' }).click();
  const htmlDownload = await htmlPending;
  const standalone = await readFile((await htmlDownload.path())!, 'utf8');
  expect(standalone).not.toContain('<div class="note-id-boxes">');
  expect(standalone).toContain('data:image/png;base64,');
  await page.screenshot({ path: '.tmp/promissory-studio.png', fullPage: true });
});

test('summary paginates all clients, shows total once, and exports Word and standalone HTML', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?many=1');
  await page.getByRole('tab', { name: 'Daily Summary Sheet' }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.summary-table tbody tr')).toHaveCount(65);
  await expect(frame.locator('tfoot')).toHaveCount(1);
  await expect(frame.locator('tfoot')).toContainText('750.00');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  const pdf = await page.locator('iframe').elementHandle();
  expect(pdf).not.toBeNull();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const download = await pending;
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(strFromU8(files['word/document.xml'])).toContain('750.00');
  const next = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML' }).click();
  const htmlFile = await next;
  const html = await readFile((await htmlFile.path())!, 'utf8');
  expect(html).toContain('data:image/png;base64,');
  expect(html).not.toContain('with-grid');
  await page.screenshot({ path: '.tmp/summary-studio.png', fullPage: true });
});

test('batch notes export separately in a ZIP and narrow screen remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Promissory Note' }).click();
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select all matches' }).check();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX bundle' }).click();
  const download = await pending;
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(Object.keys(files)).toHaveLength(3);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('PDF output has the configured paper sizes and no extra blank pages', async ({ page, context }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  for (const [title, expectedPages, widthPt, heightPt] of [
    ['Index Card', 1, 297 / 25.4 * 72, 210 / 25.4 * 72],
    ['Promissory Note', 1, 210 / 25.4 * 72, 297 / 25.4 * 72],
    ['Daily Summary Sheet', 1, 297 / 25.4 * 72, 210 / 25.4 * 72],
  ] as const) {
    await page.getByRole('tab', { name: title }).click();
    await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
    const html = await page.frameLocator('iframe').locator('html').evaluate((node) => node.outerHTML);
    const printPage = await context.newPage();
    await printPage.setContent(html);
    await printPage.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode())); });
    const bytes = await printPage.pdf({ preferCSSPageSize: true, printBackground: true, path: `.tmp/${title.replaceAll(' ', '-')}.pdf` });
    const pdf = bytes.toString('latin1');
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(expectedPages);
    const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(Number(box?.[1])).toBeCloseTo(widthPt, 0);
    expect(Number(box?.[2])).toBeCloseTo(heightPt, 0);
    await printPage.close();
  }
});

test('settings expose the template configuration and reject invalid client ID formats', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?view=settings');
  await expect(page.getByLabel('Payee / person to pay')).toHaveValue('CRISTOPHER A. LASARTE');
  await expect(page.getByLabel('Interest and service charge statement')).toContainText('PHP 150.00');
  await page.getByLabel('Client ID prefix', { exact: true }).fill('../invalid');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Client ID prefix must start');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByLabel('Client ID prefix', { exact: true })).toHaveValue('mcl');
  await page.screenshot({ path: '.tmp/settings.png', fullPage: true });
});

test('smart search and checked bulk selections persist across documents and export only selected clients', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  const search = page.getByRole('searchbox', { name: 'Search clients' });
  await search.fill('CRUZ juan');
  await expect(page.getByRole('list', { name: 'Client search results' }).locator('li')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeDisabled();
  await search.fill('mcl-0002');
  await page.getByRole('checkbox', { name: /Select .*\(mcl0002\)/ }).check();
  await search.fill('00003');
  await page.getByRole('checkbox', { name: /Select .*\(mcl0003\)/ }).check();
  await search.fill('no matching client');
  await expect(page.getByText('Your current selection is kept.', { exact: false })).toBeVisible();
  await expect(page.frameLocator('iframe').locator('.index-sheet')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Promissory Note' }).click();
  await expect(page.frameLocator('iframe').locator('.promissory-sheet')).toHaveCount(2);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX bundle' }).click();
  const download = await pending;
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(Object.keys(files).sort()).toEqual(['promissory-mcl0002.docx', 'promissory-mcl0003.docx']);
  await search.clear();
  await expect(page.getByRole('checkbox', { name: /Select .*\(mcl0002\)/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Select .*\(mcl0003\)/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Select .*\(mcl0001\)/ })).not.toBeChecked();
});

test('daily summary supports searched subsets and labels the selected-client grand total', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Daily Summary Sheet' }).click();
  await page.getByRole('button', { name: 'Clear selection' }).click();
  const search = page.getByRole('searchbox', { name: 'Search clients' });
  await search.fill('mcl0001');
  await page.getByRole('checkbox', { name: 'Select all matches' }).check();
  await search.fill('mcl0003');
  await page.getByRole('checkbox', { name: /Select .*\(mcl0003\)/ }).check();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.summary-table tbody tr')).toHaveCount(2);
  await expect(frame.locator('.summary-scope')).toHaveText('2 of 3 clients selected');
  await expect(frame.locator('tfoot')).toContainText('500.00');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
});

test('View Only keeps inspection interactive and hides output and layout controls', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('radio', { name: 'View Only', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save PDF' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Export/ })).toHaveCount(0);
  await expect(page.getByLabel('Paper size')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search clients' }).fill('00003');
  await page.getByRole('radio', { name: /Select .*\(mcl0003\)/ }).check();
  await expect(page.frameLocator('iframe').locator('.index-entry')).toHaveCount(58);
  await page.getByRole('tab', { name: 'Promissory Note' }).click();
  await expect(page.frameLocator('iframe').locator('.promissory-sheet')).toContainText('JUAN SANTOS SANTOS');
  await page.getByRole('radio', { name: 'Printing Mode', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Paper size')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Select .*\(mcl0003\)/ })).toBeChecked();
  await page.screenshot({ path: '.tmp/print-search-modes.png', fullPage: true });
});

test('signature rows stay aligned for standard and long borrower names', async ({ page }) => {
  for (const suffix of ['', '?longname=1']) {
    await page.goto(`/tests/fixtures/print-studio.html${suffix}`);
    await page.getByRole('tab', { name: 'Promissory Note' }).click();
    const table = page.frameLocator('iframe').getByRole('table', { name: 'Co-maker and borrower signatures' });
    await expect(table.locator('tr')).toHaveCount(6);
    const geometry = await table.evaluate((element) => [...element.querySelectorAll('tr')].map((row) => [...row.cells].map((cell) => {
      const rect = cell.getBoundingClientRect();
      const text = cell.querySelector('.note-signature-name')?.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, bottom: text?.bottom };
    })));
    for (const row of geometry) {
      expect(row[0].y).toBeCloseTo(row[1].y, 0);
      expect(row[0].width).toBeCloseTo(row[1].width, 0);
      expect(row[0].x).toBeCloseTo(geometry[0][0].x, 0);
      expect(row[1].x).toBeCloseTo(geometry[0][1].x, 0);
    }
    expect(geometry[0][0].bottom!).toBeCloseTo(geometry[0][1].bottom!, 0);
  }
  await page.screenshot({ path: '.tmp/promissory-signature-alignment.png', fullPage: true });
});
