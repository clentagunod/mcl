import { useId } from 'react';

export function SettingsSwitch({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return <div className="settings-switch-row">
    <div><label htmlFor={id}>{label}</label><p id={`${id}-description`} className="field-hint">{description}</p></div>
    <label className="settings-switch-control"><input id={id} type="checkbox" role="switch" checked={checked}
      aria-describedby={`${id}-description`} onChange={event => onChange(event.target.checked)} />
      <span className="settings-switch-track" aria-hidden="true" /><span className="settings-switch-state" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
    </label>
  </div>;
}
