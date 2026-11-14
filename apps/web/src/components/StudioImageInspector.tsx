import { useId, useState } from 'react';
import { FormField } from './FormField';
import { Icon } from './Icon';
import type { PrintImage } from '../lib/print-studio';

interface Props {
  image: PrintImage;
  compact?: boolean;
  allowIdPage?: boolean;
  lockAspect: boolean;
  onLockAspect: (value: boolean) => void;
  onChange: (patch: Partial<PrintImage>) => void;
  onFit: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onLayer: (front: boolean) => void;
}

export function StudioImageInspector({ image, compact = false, allowIdPage = true, lockAspect, onLockAspect, onChange, onFit, onRemove, onDuplicate, onLayer }: Props) {
  const [tab, setTab] = useState<'position' | 'appearance'>('position');
  const tabId = useId();
  function number(field: 'x' | 'y' | 'width' | 'height' | 'rotation') {
    return { value: Math.round(image[field] * 10) / 10, onChange: (event: { target: { value: string } }) => {
      const value = Number(event.target.value);
      const patch: Partial<PrintImage> = { [field]: value };
      if (lockAspect && field === 'width') patch.height = value / image.width * image.height;
      if (lockAspect && field === 'height') patch.width = value / image.height * image.width;
      onChange(patch);
    } };
  }
  return <section className="image-inspector" aria-label="Image properties">
    <div className="editor-panel-heading"><h3>Picture format</h3><span className="editor-local-tag">Session only</span></div>
    {!compact && <div className="inspector-image"><img src={image.dataUrl} alt={image.name} /></div>}
    <p className="inspector-filename" title={image.name}>{image.name}</p>
    {!compact && <p className="editor-help">Drag to move. Use the corner handles to resize and the round handle to rotate.</p>}
    {compact && <div role="tablist" aria-label="Picture properties" className="inspector-tabs">{(['position', 'appearance'] as const).map(value => <button type="button" role="tab" key={value} id={`${tabId}-${value}`} aria-controls={`${tabId}-panel`} tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onClick={() => setTab(value)} onKeyDown={event => {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'position' : event.key === 'End' ? 'appearance' : value === 'position' ? 'appearance' : 'position'; setTab(next); document.getElementById(`${tabId}-${next}`)?.focus(); }
    }}>{value === 'position' ? 'Position' : 'Appearance'}</button>)}</div>}
    <div id={`${tabId}-panel`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${tabId}-${tab}` : undefined}>
    {(!compact || tab === 'position') && <>
    <FormField label="Image page"><select value={image.page} disabled={image.locked} onChange={event => onChange({ page: event.target.value as PrintImage['page'] })}><option value="note">Promissory note</option>{allowIdPage && <option value="id">ID attachment</option>}</select></FormField>
    <div className="inspector-grid">
      <FormField label="Left (mm)"><input type="number" step="0.5" disabled={image.locked} {...number('x')} /></FormField>
      <FormField label="Top (mm)"><input type="number" step="0.5" disabled={image.locked} {...number('y')} /></FormField>
      <FormField label="Image width (mm)"><input type="number" min="3" step="0.5" disabled={image.locked} {...number('width')} /></FormField>
      <FormField label="Image height (mm)"><input type="number" min="3" step="0.5" disabled={image.locked} {...number('height')} /></FormField>
    </div>
    <label className="editor-check"><input type="checkbox" checked={lockAspect} onChange={event => onLockAspect(event.target.checked)} /> Lock aspect ratio</label>
    <button className="btn btn-block" type="button" disabled={image.locked} onClick={onFit}>{image.purpose === 'id' ? 'Fit to ID box' : 'Place over signature'}</button>
    </>}
    {(!compact || tab === 'appearance') && <>
    <div className="inspector-grid">
      <FormField label="Rotation (degrees)"><input type="number" step="1" disabled={image.locked} {...number('rotation')} /></FormField>
      <FormField label="Opacity (%)"><input type="number" min="5" max="100" step="5" disabled={image.locked} value={Math.round(image.opacity * 100)} onChange={event => onChange({ opacity: Number(event.target.value) / 100 })} /></FormField>
    </div>
    <div className="inspector-buttons">
      <button className="btn btn-small" type="button" disabled={image.locked} onClick={() => onChange({ rotation: image.rotation - 90 })}>Rotate −90°</button>
      <button className="btn btn-small" type="button" disabled={image.locked} onClick={() => onChange({ rotation: image.rotation + 90 })}>Rotate +90°</button>
      <button className="btn btn-small" type="button" disabled={image.locked} aria-pressed={image.flipX} onClick={() => onChange({ flipX: !image.flipX })}>Flip horizontal</button>
      <button className="btn btn-small" type="button" disabled={image.locked} aria-pressed={image.flipY} onClick={() => onChange({ flipY: !image.flipY })}>Flip vertical</button>
    </div>
    <div className="inspector-buttons">
      <button className="btn btn-small" type="button" onClick={() => onLayer(true)}>Bring to front</button>
      <button className="btn btn-small" type="button" onClick={() => onLayer(false)}>Send to back</button>
      <button className="btn btn-small" type="button" onClick={onDuplicate}>Duplicate image</button>
      <button className="btn btn-small" type="button" aria-pressed={image.locked} onClick={() => onChange({ locked: !image.locked })}>{image.locked ? 'Unlock image' : 'Lock image'}</button>
    </div>
    </>}
    </div>
    <button className="btn btn-block editor-remove-image" type="button" onClick={onRemove}><Icon name="trash" size={15} /> Remove image</button>
    {!compact && <p className="editor-help">Arrow keys move 1 mm; Shift + arrow moves 10 mm. Delete removes the selected image.</p>}
  </section>;
}
