import { useEffect, useRef } from 'react';

export function SelectionCheckbox({ checked, mixed = false, label, onChange, disabled = false }: {
  checked: boolean; mixed?: boolean; label: string; onChange: () => void; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" className="selection-checkbox" aria-label={label}
    checked={checked} onChange={onChange} disabled={disabled} />;
}
