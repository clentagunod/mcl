import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/settings';
import { renderPrintDocument, type PrintJob } from './print-renderer';
import { boundImage, DEFAULT_PRESENTATION, freshStudioDraft, isPrintImageData, type PrintImage } from './print-studio';
import { wordImageAnchors } from './print-word-images';
import type { Client } from '../types';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=';
const image: PrintImage = { id: 'picture1', clientId: 'a', purpose: 'id', party: 'client', page: 'id', name: '<ID & signature>', dataUrl: png, naturalWidth: 100, naturalHeight: 60, x: 10, y: 20, width: 85.6, height: 54, rotation: 0, opacity: 1, flipX: false, flipY: false, locked: false };
const client: Client = { id: 'a', firstName: 'Juan', lastName: 'Cruz', middleName: '', address: 'Tagum', cellphone: '', principal: 10000, interest: 1250, loanTermDays: 45, approvalDate: '2026-11-01' };
const job: PrintJob = { kind: 'promissory', clients: [client], payments: [], holidays: [], settings: { ...DEFAULT_SETTINGS, promissory: { ...DEFAULT_SETTINGS.promissory, includeIdPage: true } }, layout: DEFAULT_SETTINGS.studio.promissory, date: '2026-11-01', logoUrl: '/logo.png' };

describe('session print images', () => {
  it.each([0, 45, 90, 135, 270, -90, 999])('keeps the entire rotated image on the page at %s degrees', rotation => {
    const placed = boundImage({ ...image, rotation, width: 400, height: 300, x: -30, y: 500 }, { width: 210, height: 297 });
    const angle = placed.rotation * Math.PI / 180;
    const width = Math.abs(Math.cos(angle)) * placed.width + Math.abs(Math.sin(angle)) * placed.height;
    const height = Math.abs(Math.sin(angle)) * placed.width + Math.abs(Math.cos(angle)) * placed.height;
    expect(placed.x + placed.width / 2 - width / 2).toBeGreaterThanOrEqual(-.001);
    expect(placed.y + placed.height / 2 - height / 2).toBeGreaterThanOrEqual(-.001);
    expect(placed.x + placed.width / 2 + width / 2).toBeLessThanOrEqual(210.001);
    expect(placed.y + placed.height / 2 + height / 2).toBeLessThanOrEqual(297.001);
  });
  it('bounds malformed numeric edits and permits only normalized PNG data', () => {
    expect(boundImage({ ...image, width: NaN, x: Infinity, opacity: 8 }, { width: 210, height: 297 })).toMatchObject({ width: 40, x: 10, opacity: 1 });
    expect(isPrintImageData(png)).toBe(true);
    expect(isPrintImageData('https://example.com/id.png')).toBe(false);
    expect(isPrintImageData('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
  });
  it('places images only in their owning client and page without unresolved markup', () => {
    const rendered = renderPrintDocument({ ...job, clients: [client, { ...client, id: 'b' }], images: [image, { ...image, id: 'signature', purpose: 'signature', page: 'note' }] });
    expect(rendered.pages).toBe(4);
    expect(rendered.html.match(/data-print-image=/g)).toHaveLength(2);
    expect(rendered.html).toContain('aria-label="&lt;ID &amp; signature&gt;"');
    const other = rendered.html.slice(rendered.html.indexOf('data-client-id="b"'));
    expect(other).not.toContain('data-print-image=');
  });
  it('blocks hidden attachment images and external image URLs', () => {
    expect(() => renderPrintDocument({ ...job, settings: DEFAULT_SETTINGS, images: [image] })).toThrow('Enable the ID page');
    expect(() => renderPrintDocument({ ...job, images: [{ ...image, dataUrl: 'https://example.com/private.png' }] })).toThrow('invalid');
  });
  it('exports Word media, page anchors, rotation, flips and opacity using the same coordinates', () => {
    const files: Record<string, Uint8Array> = {};
    const output = wordImageAnchors([{ ...image, rotation: 90, flipX: true, opacity: .5 }], { width: 210, height: 297 }, files);
    expect(files['word/media/studio-image-1.png'].slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(output.relationships).toContain('Target="media/studio-image-1.png"');
    expect(output.runs[0].run).toContain('rot="5400000" flipH="1"');
    expect(output.runs[0].run).toContain('amt="50000"');
    expect(output.runs[0].run).toContain('name="&lt;ID &amp; signature&gt;"');
    expect(output.runs[0].run).toContain('<wp:positionH relativeFrom="page">');
  });
  it('keeps new documents independent and print presentation outside saved settings', () => {
    const a = freshStudioDraft(), b = freshStudioDraft();
    a.images.push(image); a.presentation.font = 'Georgia';
    expect(b.images).toEqual([]); expect(b.presentation).toEqual(DEFAULT_PRESENTATION);
    const before = JSON.stringify(DEFAULT_SETTINGS);
    expect(renderPrintDocument({ ...job, presentation: { ...DEFAULT_PRESENTATION, font: 'Georgia', lineSpacing: 1.3, hideLogo: true } }).html).toContain('font-family:"Georgia"');
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before);
  });
});
