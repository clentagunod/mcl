import { useEffect, useRef } from 'react';
import { boundImage, imageStyle, PX_PER_MM, type PrintImage } from '../lib/print-studio';

interface Options {
  document: Document | null;
  images: readonly PrintImage[];
  selectedId: string;
  editable: boolean;
  lockAspect: boolean;
  size: { width: number; height: number };
  select: (id: string) => void;
  commit: (image: PrintImage) => void;
  remove: (id: string) => void;
  undo: () => void;
  redo: () => void;
  print: () => void;
}

/** The preview stays script-free. Only the parent attaches local pointer/keyboard handlers. */
export function usePrintImageCanvas(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const doc = options.document;
    if (!doc) return;
    doc.body.dataset.editingImages = String(options.editable);
    for (const node of doc.querySelectorAll<HTMLElement>('[data-print-image]')) {
      node.querySelectorAll('.artwork-handle').forEach(handle => handle.remove());
      const selected = options.editable && node.dataset.printImage === options.selectedId;
      node.dataset.selected = String(selected);
      node.tabIndex = options.editable ? 0 : -1;
      const image = options.images.find(item => item.id === node.dataset.printImage);
      if (!selected || image?.locked) continue;
      for (const action of ['nw', 'ne', 'sw', 'se', 'rotate']) {
        const handle = doc.createElement('button');
        handle.type = 'button'; handle.className = `artwork-handle artwork-${action}`; handle.dataset.action = action;
        handle.setAttribute('aria-label', action === 'rotate' ? 'Rotate image' : `Resize image ${action}`);
        node.append(handle);
      }
    }
  }, [options.document, options.editable, options.selectedId, options.images]);

  useEffect(() => {
    const doc = options.document;
    if (!doc) return;
    let stopDrag: (() => void) | undefined;
    function pointerDown(event: PointerEvent) {
      const current = latest.current;
      if (!current.editable || event.button !== 0) return;
      const target = event.target as HTMLElement;
      const foundNode = target.closest<HTMLElement>('[data-print-image]');
      if (!foundNode) { current.select(''); return; }
      const node: HTMLElement = foundNode;
      const foundImage = current.images.find(item => item.id === node.dataset.printImage);
      if (!foundImage) return;
      const image: PrintImage = foundImage;
      event.preventDefault(); current.select(image.id); node.focus({ preventScroll: true });
      if (image.locked) return;
      stopDrag?.();
      const action = target.dataset.action || 'move';
      const startX = event.clientX, startY = event.clientY;
      const sheet = node.closest<HTMLElement>('.sheet')!;
      const rect = sheet.getBoundingClientRect();
      const cx = rect.left + (image.x + image.width / 2) * PX_PER_MM;
      const cy = rect.top + (image.y + image.height / 2) * PX_PER_MM;
      const startAngle = Math.atan2(startY - cy, startX - cx);
      let changed = false, draft = image;
      node.setPointerCapture(event.pointerId);
      function move(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== event.pointerId) return;
        moveEvent.preventDefault();
        const dx = (moveEvent.clientX - startX) / PX_PER_MM;
        const dy = (moveEvent.clientY - startY) / PX_PER_MM;
        if (Math.abs(dx) + Math.abs(dy) < .15) return;
        changed = true;
        if (action === 'move') draft = { ...image, x: image.x + dx, y: image.y + dy };
        else if (action === 'rotate') draft = { ...image, rotation: image.rotation + (Math.atan2(moveEvent.clientY - cy, moveEvent.clientX - cx) - startAngle) * 180 / Math.PI };
        else {
          const angle = image.rotation * Math.PI / 180;
          const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
          const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
          const sx = action.includes('w') ? -1 : 1, sy = action.includes('n') ? -1 : 1;
          let width = Math.max(3, image.width + sx * localX), height = Math.max(3, image.height + sy * localY);
          if (latest.current.lockAspect) {
            const scale = Math.max(width / image.width, height / image.height);
            width = image.width * scale; height = image.height * scale;
          }
          const shiftX = sx * (width - image.width) / 2, shiftY = sy * (height - image.height) / 2;
          draft = { ...image, width, height,
            x: image.x + shiftX * Math.cos(angle) - shiftY * Math.sin(angle) - (width - image.width) / 2,
            y: image.y + shiftX * Math.sin(angle) + shiftY * Math.cos(angle) - (height - image.height) / 2 };
        }
        draft = boundImage(draft, latest.current.size);
        node.style.cssText = imageStyle(draft);
      }
      function finish(endEvent: PointerEvent) {
        if (endEvent.pointerId !== event.pointerId) return;
        const cancel = endEvent.type === 'pointercancel';
        stopDrag?.();
        if (changed && !cancel) latest.current.commit(draft);
        else node!.style.cssText = imageStyle(image!);
      }
      stopDrag = () => {
        doc!.removeEventListener('pointermove', move); doc!.removeEventListener('pointerup', finish); doc!.removeEventListener('pointercancel', finish);
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        stopDrag = undefined;
      };
      doc!.addEventListener('pointermove', move); doc!.addEventListener('pointerup', finish); doc!.addEventListener('pointercancel', finish);
    }
    function keyDown(event: KeyboardEvent) {
      const current = latest.current;
      if (current.editable && (event.ctrlKey || event.metaKey)) {
        const key = event.key.toLowerCase();
        if (key === 'z') { event.preventDefault(); if (event.shiftKey) current.redo(); else current.undo(); return; }
        if (key === 'y') { event.preventDefault(); current.redo(); return; }
        if (key === 'p') { event.preventDefault(); current.print(); return; }
      }
      if (event.key === 'Escape') { current.select(''); return; }
      if (!current.editable || !(event.target as Element).closest('[data-print-image]')) return;
      const image = current.images.find(item => item.id === current.selectedId);
      if (!image || image.locked) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); current.remove(image.id); return; }
      const step = event.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (delta) { event.preventDefault(); current.commit(boundImage({ ...image, x: image.x + delta[0], y: image.y + delta[1] }, current.size)); }
    }
    doc.addEventListener('pointerdown', pointerDown); doc.addEventListener('keydown', keyDown);
    return () => { stopDrag?.(); doc.removeEventListener('pointerdown', pointerDown); doc.removeEventListener('keydown', keyDown); };
  }, [options.document]);
}
