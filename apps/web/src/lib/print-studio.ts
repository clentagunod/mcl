import type { PrintLayout } from '../config/settings';

export const STUDIO_FONTS = ['Template font', 'Arial', 'Calibri', 'Times New Roman', 'Georgia'] as const;
export interface PrintPresentation {
  font: (typeof STUDIO_FONTS)[number];
  lineSpacing: number;
  hideLogo: boolean;
  noteAlignment: 'template' | 'left' | 'justify';
}
export const DEFAULT_PRESENTATION: PrintPresentation = { font: 'Template font', lineSpacing: 0, hideLogo: false, noteAlignment: 'template' };

export interface PrintImage {
  id: string;
  clientId: string;
  name: string;
  purpose: 'id' | 'signature';
  party: 'client' | 'co-maker';
  page: 'note' | 'id';
  /** Normalized PNG pixels held in memory only. Never written to shared records. */
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  locked: boolean;
}

export interface StudioDraft {
  layout?: PrintLayout;
  presentation: PrintPresentation;
  images: PrintImage[];
  /** A local print-job choice; saved workspace defaults remain unchanged. */
  includeIdPage?: boolean;
}
export const freshStudioDraft = (): StudioDraft => ({ presentation: { ...DEFAULT_PRESENTATION }, images: [] });
export const PX_PER_MM = 96 / 25.4;

export function boundImage(image: PrintImage, page: { width: number; height: number }): PrintImage {
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  const rotation = ((finite(image.rotation, 0) % 360) + 360) % 360;
  let width = Math.max(3, Math.min(page.width, finite(image.width, 40)));
  let height = Math.max(3, Math.min(page.height, finite(image.height, 15)));
  const angle = rotation * Math.PI / 180;
  let extentWidth = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
  let extentHeight = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
  const scale = Math.min(1, page.width / extentWidth, page.height / extentHeight);
  width *= scale; height *= scale; extentWidth *= scale; extentHeight *= scale;
  const insetX = (extentWidth - width) / 2;
  const insetY = (extentHeight - height) / 2;
  return { ...image, rotation, width, height,
    x: Math.min(page.width - width - insetX, Math.max(insetX, finite(image.x, 10))),
    y: Math.min(page.height - height - insetY, Math.max(insetY, finite(image.y, 10))),
    opacity: Math.min(1, Math.max(0.05, finite(image.opacity, 1))),
  };
}

export function imageStyle(image: PrintImage): string {
  return `left:${image.x}mm;top:${image.y}mm;width:${image.width}mm;height:${image.height}mm;transform:rotate(${image.rotation}deg);opacity:${image.opacity}`;
}

export function isPrintImageData(value: string): boolean {
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** Decode raster files locally, strip metadata, and bound the retained pixel buffer. */
export async function readPrintImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!png && !jpeg && !webp) throw new Error('Choose a PNG, JPEG or WebP image.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error('This image could not be read. Choose another file.'); }
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 25_000_000) throw new Error('Choose an image with fewer than 25 million pixels.');
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing is unavailable in this browser.');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
