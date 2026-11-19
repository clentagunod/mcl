import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

test('one, two and three selected index cards retain the full velum sheet and fixed card slots', async ({ page, context }) => {
  await page.goto('/tests/fixtures/print-studio.html?comaker=1');
  const frame = page.frameLocator('iframe');
  const print = page.getByRole('button', { name: 'Print', exact: true });
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue(/Velum.*8½.*13/);
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();

  let firstCardHeight = 0;
  for (let count = 1; count <= 3; count += 1) {
    if (count > 1) await page.getByRole('checkbox', { name: new RegExp(`Select .*\\(mcl000${count}\\)`) }).check();
    await expect(frame.locator('.index-sheet')).toHaveCount(1);
    await expect(frame.locator('.index-card')).toHaveCount(count);
    await expect(print).toBeEnabled();
    const geometry = await frame.locator('.index-sheet').evaluate(sheet => {
      const paper = sheet.getBoundingClientRect();
      return { width: paper.width, height: paper.height, cards: [...sheet.querySelectorAll('.index-card')].map(card => {
        const bounds = card.getBoundingClientRect();
        return { top: bounds.top - paper.top, bottom: bounds.bottom - paper.top, height: bounds.height, right: bounds.right - paper.left };
      }) };
    });
    expect(geometry.width).toBeCloseTo(8.5 * 96, 0);
    expect(geometry.height).toBeCloseTo(13 * 96, 0);
    firstCardHeight ||= geometry.cards[0].height;
    for (const [index, card] of geometry.cards.entries()) {
      expect(card.height).toBeCloseTo(firstCardHeight, 0);
      expect(card.bottom).toBeLessThanOrEqual(geometry.height + 1);
      expect(card.right).toBeLessThanOrEqual(geometry.width + 1);
      if (index) expect(card.top).toBeGreaterThanOrEqual(geometry.cards[index - 1].bottom - 1);
    }
  }
  await expect(frame.locator('.index-details').first()).toContainText('Juan Santos Dela Cruz/Maria Reyes');
  await expect(frame.locator('.index-details').nth(1)).not.toContainText('/');
  await expect(frame.locator('.index-details').nth(2)).not.toContainText('/');
  await page.screenshot({ path: '.tmp/velum-three-index-cards.png', fullPage: true });

  const output = await context.newPage();
  const html = await frame.locator('html').evaluate(node => node.outerHTML);
  await output.setContent(`<!doctype html>${html}`);
  await output.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const bytes = await output.pdf({ preferCSSPageSize: true, printBackground: true, path: '.tmp/velum-three-index-cards.pdf' });
  const pdf = bytes.toString('latin1');
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
  const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  expect(Number(box?.[1])).toBeCloseTo(612, 0);
  expect(Number(box?.[2])).toBeCloseTo(936, 0);
  await output.close();

  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await expect(frame.locator('.note-p-2').first()).toContainText('I/WE JUAN SANTOS DELA CRUZ/MARIA REYES');
  await expect(frame.locator('.note-p-2').nth(1)).toContainText('I/WE JUAN SANTOS REYES of legal age');
  await expect(frame.locator('.note-signature-name').nth(1)).toHaveText('JUAN SANTOS DELA CRUZ');
});

test('continuation cards flow into the next velum sheet without omitted entries or extra PDF pages', async ({ page, context }) => {
  await page.goto('/tests/fixtures/print-studio.html?latepayments=1&continuation=1&comaker=1');
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select all matches' }).check();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.index-sheet')).toHaveCount(2);
  await expect(frame.locator('.index-sheet').first().locator('.index-card')).toHaveCount(3);
  await expect(frame.locator('.index-sheet').last().locator('.index-card')).toHaveCount(1);
  await expect(frame.locator('.index-entry')).toHaveCount(45 + 50 + 62);
  await expect(frame.locator('.index-sheet').last()).toContainText('Card 2/2');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  const output = await context.newPage();
  await output.setContent(`<!doctype html>${await frame.locator('html').evaluate(node => node.outerHTML)}`);
  await output.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const bytes = await output.pdf({ preferCSSPageSize: true, printBackground: true, path: '.tmp/velum-continuation.pdf' });
  expect(bytes.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  await output.close();
});

test('overlapping payment fields block printing until the font fits the card', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?largepayment=1');
  const print = page.getByRole('button', { name: 'Print', exact: true });
  await expect(page.frameLocator('iframe').locator('.index-entry').first()).toContainText('987,654,321.12');
  await expect(page.getByRole('alert')).toContainText('Some index-card content exceeds');
  await expect(print).toBeDisabled();
  await page.getByLabel('Font size (pt)', { exact: true }).fill('6');
  await expect(print).toBeEnabled();
});
