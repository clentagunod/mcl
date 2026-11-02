import type { PrintLayout } from '../config/settings';
import { FormField } from './FormField';

export function PrintLayoutFields({ value, onChange }: { value: PrintLayout; onChange: (value: PrintLayout) => void }) {
  function numeric(field: 'widthMm' | 'heightMm' | 'marginMm' | 'fontSize') {
    return { value: value[field], onChange: (event: { target: { value: string } }) => onChange({ ...value, [field]: Number(event.target.value) }) };
  }
  return (
    <div className="form-grid print-layout-fields">
      <FormField label="Paper size">
        <select value={value.paper} onChange={(event) => onChange({ ...value, paper: event.target.value as PrintLayout['paper'] })}>
          <option value="template">Template size</option><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="custom">Custom</option>
        </select>
      </FormField>
      <FormField label="Orientation">
        <select value={value.orientation} onChange={(event) => onChange({ ...value, orientation: event.target.value as PrintLayout['orientation'] })}>
          <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
        </select>
      </FormField>
      {value.paper === 'custom' && <>
        <FormField label="Width (mm)"><input type="number" min="70" max="600" step="0.1" {...numeric('widthMm')} /></FormField>
        <FormField label="Height (mm)"><input type="number" min="70" max="600" step="0.1" {...numeric('heightMm')} /></FormField>
      </>}
      <FormField label="Margin (mm)"><input type="number" min="0" max="30" step="0.1" {...numeric('marginMm')} /></FormField>
      <FormField label="Font size (pt)"><input type="number" min="6" max="18" step="0.5" {...numeric('fontSize')} /></FormField>
    </div>
  );
}
