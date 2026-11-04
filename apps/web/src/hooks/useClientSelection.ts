import { useEffect, useMemo, useState } from 'react';

/** Selection survives pagination and drops records removed by live updates. */
export function useClientSelection(ids: readonly string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const available = useMemo(() => new Set(ids), [ids]);
  const selectedIds = useMemo(() => [...selected].filter(id => available.has(id)), [selected, available]);
  useEffect(() => {
    setSelected(current => [...current].some(id => !available.has(id))
      ? new Set([...current].filter(id => available.has(id))) : current);
  }, [available]);
  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const togglePage = (pageIds: string[]) => setSelected(current => {
    const next = new Set(current);
    const remove = pageIds.every(id => current.has(id));
    pageIds.forEach(id => { if (remove) next.delete(id); else next.add(id); });
    return next;
  });
  return { selected, selectedIds, toggle, togglePage,
    selectAll: (matching: string[]) => setSelected(new Set(matching)), clear: () => setSelected(new Set()) };
}
