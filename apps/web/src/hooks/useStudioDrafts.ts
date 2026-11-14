import { useState } from 'react';
import type { PrintableKind } from '../config/settings';
import { freshStudioDraft, type StudioDraft } from '../lib/print-studio';

interface History { past: StudioDraft[]; current: StudioDraft; future: StudioDraft[] }
const freshHistory = (): History => ({ past: [], current: freshStudioDraft(), future: [] });

/** History holds references to immutable image data, rather than copying pixel buffers. */
export function useStudioDrafts(kind: PrintableKind) {
  const [histories, setHistories] = useState<Record<PrintableKind, History>>(() => ({ index: freshHistory(), promissory: freshHistory(), summary: freshHistory() }));
  const history = histories[kind];
  function change(update: (draft: StudioDraft) => StudioDraft, replace = false) {
    setHistories(previous => {
      const current = previous[kind];
      return { ...previous, [kind]: { past: replace ? current.past : [...current.past, current.current].slice(-40), current: update(current.current), future: [] } };
    });
  }
  function undo() { setHistories(previous => {
    const h = previous[kind];
    return h.past.length ? { ...previous, [kind]: { past: h.past.slice(0, -1), current: h.past.at(-1)!, future: [h.current, ...h.future] } } : previous;
  }); }
  function redo() { setHistories(previous => {
    const h = previous[kind];
    return h.future.length ? { ...previous, [kind]: { past: [...h.past, h.current], current: h.future[0], future: h.future.slice(1) } } : previous;
  }); }
  return { draft: history.current, change, undo, redo, canUndo: !!history.past.length, canRedo: !!history.future.length };
}
