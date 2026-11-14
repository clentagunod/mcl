import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com)/, route => route.abort());
});

async function picture(page: Page, signature = false) {
  return Buffer.from(await page.evaluate(isSignature => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = isSignature ? 120 : 250;
    const context = canvas.getContext('2d')!;
    if (isSignature) {
      context.strokeStyle = '#133e67'; context.lineWidth = 5; context.beginPath();
      context.moveTo(20, 90); context.bezierCurveTo(160, -50, 30, 150, 180, 30); context.bezierCurveTo(80, 110, 250, 10, 380, 85); context.stroke();
    } else { context.fillStyle = '#e4edf7'; context.fillRect(0, 0, 400, 250); context.fillStyle = '#194b79'; context.font = '30px Arial'; context.fillText('SYNTHETIC TEST ID', 35, 130); }
    return canvas.toDataURL('image/png').split(',')[1];
  }, signature), 'base64');
}

async function upload(page: Page, signature = false, name = signature ? 'signature.png' : 'id.png') {
  await page.getByLabel(signature ? 'E-signature file' : 'ID image file', { exact: true }).setInputFiles({ name, mimeType: 'image/png', buffer: await picture(page, signature) });
  await expect(page.getByRole('region', { name: 'Image properties' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
}

test('each printable has independent typography, layout, view options and undo history', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByLabel('Font family', { exact: true }).selectOption('Georgia');
  await page.getByLabel('Paper size', { exact: true }).selectOption('letter');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Template font');
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('a4');
  await page.getByLabel('Font family', { exact: true }).selectOption('Arial');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Template font');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Arial');
  await page.getByRole('tab', { name: 'Index Card', exact: true }).click();
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Georgia');
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('letter');
  await page.getByLabel('Zoom', { exact: true }).selectOption('50');
  await page.getByRole('tab', { name: 'Daily Summary Sheet', exact: true }).click();
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('75');
  await expect(page.getByLabel('Collection date', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload ID image', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'View', exact: true }).click();
  await page.getByLabel('Size grid', { exact: true }).check();
  await expect(page.locator('.studio-workspace')).toHaveClass(/with-grid/);
  await page.reload();
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Template font');
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('a4');
});

test('ID images and signatures move, resize, rotate and export at their print positions', async ({ page, context }) => {
  const remote: string[] = [];
  page.on('request', request => { if (/firestore.googleapis.com|firebasestorage.googleapis.com/.test(request.url())) remote.push(request.url()); });
  await page.goto('/tests/fixtures/print-studio.html?idpage=1');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await upload(page);
  let frame = page.frameLocator('iframe');
  await expect(frame.locator('.promissory-id-sheet .print-artwork')).toHaveCount(1);
  await expect(page.getByLabel('Page number', { exact: true })).toHaveValue('2');
  const artwork = frame.locator('.print-artwork').first();
  const before = await artwork.evaluate(node => parseFloat((node as HTMLElement).style.left));
  await artwork.scrollIntoViewIfNeeded();
  const box = (await artwork.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 15, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => artwork.evaluate(node => parseFloat((node as HTMLElement).style.left))).toBeGreaterThan(before + 5);
  await artwork.scrollIntoViewIfNeeded();
  const width = await artwork.evaluate(node => parseFloat((node as HTMLElement).style.width));
  const handle = (await artwork.locator('.artwork-se').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + 20, handle.y + 12, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => artwork.evaluate(node => parseFloat((node as HTMLElement).style.width))).toBeGreaterThan(width);
  await artwork.scrollIntoViewIfNeeded();
  const shape = (await artwork.boundingBox())!;
  const rotationHandle = (await artwork.locator('.artwork-rotate').boundingBox())!;
  const centreX = shape.x + shape.width / 2, centreY = shape.y + shape.height / 2;
  const radius = centreY - (rotationHandle.y + rotationHandle.height / 2);
  await page.mouse.move(rotationHandle.x + rotationHandle.width / 2, rotationHandle.y + rotationHandle.height / 2); await page.mouse.down();
  await page.mouse.move(centreX + radius, centreY, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => Number(await page.getByLabel('Rotation (degrees)', { exact: true }).inputValue())).toBeGreaterThan(60);
  await page.getByLabel('Rotation (degrees)', { exact: true }).fill('25');
  await expect(artwork).toHaveAttribute('style', /rotate\(25deg\)/);
  await page.getByRole('button', { name: 'Flip horizontal', exact: true }).click();
  await expect(artwork.locator('img')).toHaveAttribute('style', /scale\(-1,1\)/);
  await page.getByRole('button', { name: 'Lock image', exact: true }).click();
  await expect(page.getByLabel('Image width (mm)', { exact: true })).toBeDisabled();
  await expect(artwork.locator('.artwork-handle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock image', exact: true }).click();
  await upload(page, true);
  await expect(frame.locator('.promissory-sheet .print-artwork')).toHaveCount(1);
  await expect(frame.locator('.print-artwork')).toHaveCount(2);
  await page.getByLabel('Opacity (%)', { exact: true }).fill('50');
  await expect(frame.locator('.promissory-sheet .print-artwork')).toHaveCSS('opacity', '0.5');
  await frame.locator('.promissory-sheet .print-artwork').press('Control+z');
  await expect(frame.locator('.promissory-sheet .print-artwork')).toHaveCSS('opacity', '1');
  await frame.locator('.promissory-sheet .print-artwork').press('Control+y');
  await expect(frame.locator('.promissory-sheet .print-artwork')).toHaveCSS('opacity', '0.5');

  const wordPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DOCX', exact: true }).click();
  const files = unzipSync(new Uint8Array(await readFile((await (await wordPending).path())!)));
  const xml = strFromU8(files['word/document.xml']);
  expect(Object.keys(files).filter(name => name.startsWith('word/media/studio-image'))).toHaveLength(2);
  expect(xml.match(/<wp:anchor /g)).toHaveLength(2);
  expect(xml).toContain('rot="1500000" flipH="1"');
  expect(xml).toContain('amt="50000"');
  expect(xml.match(/Put your ID here/g)).toHaveLength(1); // Only the unfilled co-maker box keeps its prompt.
  expect(await page.evaluate(source => new DOMParser().parseFromString(source, 'application/xml').getElementsByTagName('parsererror').length, xml)).toBe(0);
  const htmlPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click();
  const html = await readFile((await (await htmlPending).path())!, 'utf8');
  expect(html.match(/class="print-artwork"/g)).toHaveLength(2);
  expect(html).not.toContain('data-selected="true"');
  const output = await context.newPage(); await output.setContent(html);
  await output.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const pdf = await output.pdf({ preferCSSPageSize: true, printBackground: true, path: '.tmp/editor-with-images.pdf' });
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  await output.close();
  expect(remote).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toMatch(/data:image|signature\.png|id\.png/);
  await page.reload(); await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  frame = page.frameLocator('iframe');
  await expect(frame.locator('.print-artwork')).toHaveCount(0);
  await expect(frame.locator('.promissory-id-sheet')).toHaveCount(1);
});

test('bulk pictures stay with their client and View Only protects the canvas', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?idpage=1');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await upload(page);
  await page.getByRole('checkbox', { name: 'Bulk printing', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select all matches', exact: true }).check();
  await page.getByLabel('Client to edit', { exact: true }).selectOption('mcl0002');
  await page.getByLabel('Image belongs to', { exact: true }).selectOption('co-maker');
  await upload(page, true, 'co-maker-signature.png');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('[data-client-id="mcl0001"] .print-artwork')).toHaveCount(1);
  await expect(frame.locator('[data-client-id="mcl0002"] .print-artwork')).toHaveCount(1);
  await expect(frame.locator('[data-client-id="mcl0003"] .print-artwork')).toHaveCount(0);
  await page.getByRole('button', { name: 'Duplicate image', exact: true }).click();
  await expect(frame.locator('.print-artwork')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(frame.locator('.print-artwork')).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(frame.locator('.print-artwork')).toHaveCount(3);
  await page.getByRole('radio', { name: 'View Only', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Upload e-signature', exact: true })).toHaveCount(0);
  await expect(frame.locator('.artwork-handle')).toHaveCount(0);
  await expect(frame.locator('.print-artwork')).toHaveCount(3);
  await page.getByRole('radio', { name: 'Printing Mode', exact: true }).check();
  await expect(frame.locator('.print-artwork')).toHaveCount(3);
});

test('saved ID-page settings gate upload tools and update the studio live', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Upload ID image', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('ID image file', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upload e-signature', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Layout', exact: true }).click();
  await expect(page.getByLabel('Include ID placement page', { exact: true })).toBeDisabled();
  await page.evaluate(async () => {
    const { DEFAULT_SETTINGS } = await import('/src/config/settings.ts');
    window.dispatchEvent(new CustomEvent('fixture:settings-updated', { detail: { ...DEFAULT_SETTINGS, promissory: { ...DEFAULT_SETTINGS.promissory, includeIdPage: true } } }));
  });
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await upload(page);
  await expect(page.frameLocator('iframe').locator('.print-artwork')).toHaveCount(1);
  await page.evaluate(async () => {
    const { DEFAULT_SETTINGS } = await import('/src/config/settings.ts');
    window.dispatchEvent(new CustomEvent('fixture:settings-updated', { detail: DEFAULT_SETTINGS }));
  });
  await expect(page.getByRole('button', { name: 'Upload ID image', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('ID image file', { exact: true })).toHaveCount(0);
  await expect(page.frameLocator('iframe').locator('.print-artwork')).toHaveCount(0);
  await expect(page.frameLocator('iframe').locator('.promissory-id-sheet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
});

test('View tools use the available width and stay visible in fullscreen', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html?fullscreen=1');
  await page.getByRole('tab', { name: 'View', exact: true }).click();
  const ribbon = page.getByRole('region', { name: 'View tools', exact: true });
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel('Ruler', { exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: /^(Hide|Show) clients$/ })).toBeInViewport();
    const contained = await ribbon.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('button, label')].every(control => {
        const rect = control.getBoundingClientRect();
        return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.left >= bounds.left && rect.right <= bounds.right;
      });
    });
    expect(contained).toBe(true);
    if (width === 1600) expect((await ribbon.boundingBox())!.height).toBeLessThan(70);
  }
  await page.getByLabel('Ruler', { exact: true }).uncheck();
  await expect(page.getByLabel('Millimetre ruler', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.getByRole('button', { name: 'Hide clients', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Client selection', exact: true })).toHaveCount(0);
});

test('invalid image files are rejected without changing the document', async ({ page }) => {
  await page.goto('/tests/fixtures/print-studio.html');
  await page.getByRole('tab', { name: 'Promissory Note', exact: true }).click();
  await page.getByLabel('E-signature file', { exact: true }).setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.getByRole('alert')).toContainText('PNG, JPEG or WebP');
  await expect(page.frameLocator('iframe').locator('.print-artwork')).toHaveCount(0);
  await expect(page.frameLocator('iframe').locator('.sheet')).toHaveCount(1);
  await page.getByLabel('E-signature file', { exact: true }).setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('10 MB');
});
