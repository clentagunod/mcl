import { Link } from 'react-router-dom';
import { FormField } from './FormField';
import { PrintLayoutFields } from './PrintLayoutFields';
import { Icon } from './Icon';
import type { PrintLayout, PrintableKind } from '../config/settings';
import { STUDIO_FONTS, type PrintPresentation } from '../lib/print-studio';

export type RibbonTab = 'Home' | 'Layout' | 'Insert' | 'View';
interface Props {
  kind: PrintableKind; tab: RibbonTab; layout: PrintLayout; presentation: PrintPresentation;
  printing: boolean; busy: boolean; canEdit: boolean; canUndo: boolean; canRedo: boolean;
  includeIdPage: boolean; allowIdPage: boolean; date: string; today: string; grid: boolean; ruler: boolean; showClients: boolean;
  onLayout: (layout: PrintLayout) => void; onPresentation: (patch: Partial<PrintPresentation>) => void;
  onIdPage: (enabled: boolean) => void; onDate: (value: string) => void;
  onGrid: (value: boolean) => void; onRuler: (value: boolean) => void; onClients: () => void;
  onFit: () => void; onFitPage: () => void; onActualSize: () => void; onUndo: () => void; onRedo: () => void; onReset: () => void;
  onEdit: () => void; onId: () => void; onSignature: () => void;
}

export function PrintStudioRibbon(p: Props) {
  return <div className={`editor-ribbon${p.tab === 'View' || !p.printing ? ' editor-ribbon-view' : ''}`} id="editor-ribbon" role="region" aria-label={`${p.printing ? p.tab : 'View'} tools`}>
    {p.printing && (p.tab === 'Home' || p.tab === 'Layout') && <>
      <div className="ribbon-group ribbon-history"><div className="ribbon-group-content"><button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!p.canUndo || p.busy} onClick={p.onUndo}><Icon name="undo" /></button><button type="button" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!p.canRedo || p.busy} onClick={p.onRedo}><Icon name="redo" /></button><button type="button" onClick={p.onReset} disabled={p.busy}>Reset print options</button></div><span className="ribbon-caption">Draft</span></div>
      <div className="ribbon-group"><PrintLayoutFields value={p.layout} onChange={p.onLayout} /><span className="ribbon-caption">Page setup</span></div>
      <div className="ribbon-group"><div className="ribbon-font-fields"><FormField label="Font family"><select value={p.presentation.font} onChange={event => p.onPresentation({ font: event.target.value as PrintPresentation['font'] })}>{STUDIO_FONTS.map(font => <option key={font}>{font}</option>)}</select></FormField>
        {p.kind !== 'index' && <FormField label="Line spacing"><select value={p.presentation.lineSpacing} onChange={event => p.onPresentation({ lineSpacing: Number(event.target.value) })}><option value="0">Template spacing</option>{[1, 1.15, 1.3, 1.5].map(value => <option key={value} value={value}>{value}</option>)}</select></FormField>}
        {p.kind === 'promissory' && <FormField label="Paragraph alignment"><select value={p.presentation.noteAlignment} onChange={event => p.onPresentation({ noteAlignment: event.target.value as PrintPresentation['noteAlignment'] })}><option value="template">Template alignment</option><option value="left">Align left</option><option value="justify">Justify</option></select></FormField>}
      </div><span className="ribbon-caption">Typography</span></div>
    </>}
    {p.printing && ((p.kind === 'promissory' && (p.tab === 'Home' || p.tab === 'Insert')) || (p.tab === 'Home' && p.kind === 'index')) && <div className="ribbon-group ribbon-document-tools"><div className="ribbon-group-content">
      <button type="button" disabled={!p.canEdit || p.busy} onClick={p.onEdit}><Icon name="file" />{p.kind === 'promissory' ? 'Edit promissory note' : 'Edit client details'}</button>
      {p.kind === 'promissory' && <>{p.allowIdPage && p.includeIdPage && <button type="button" disabled={!p.canEdit || p.busy} onClick={p.onId}><Icon name="image" />Upload ID image</button>}<button type="button" disabled={!p.canEdit || p.busy} onClick={p.onSignature}><Icon name="signature" />Upload e-signature</button></>}
    </div><span className="ribbon-caption">{p.kind === 'index' ? 'Saved client record' : 'Document & pictures'}</span></div>}
    {p.printing && p.tab === 'Layout' && <div className="ribbon-group"><div className="ribbon-group-content"><label className="editor-check"><input type="checkbox" checked={!p.presentation.hideLogo} onChange={event => p.onPresentation({ hideLogo: !event.target.checked })} />Show logo</label>
      {p.kind === 'promissory' && <><label className="editor-check"><input type="checkbox" checked={p.includeIdPage} disabled={!p.allowIdPage} onChange={event => p.onIdPage(event.target.checked)} />Include ID placement page</label><Link to="/settings#settings-promissory" target="_blank" rel="noopener noreferrer">Saved ID box sizes</Link></>}
    </div><span className="ribbon-caption">This print job</span></div>}
    {(p.tab === 'View' || !p.printing) && <div className="ribbon-group"><div className="ribbon-group-content"><button type="button" onClick={p.onFit}><Icon name="expand" />Fit width</button><button type="button" onClick={p.onFitPage}>Fit page</button><button type="button" onClick={p.onActualSize}>Actual size</button><label className="editor-check"><input type="checkbox" checked={p.grid} onChange={event => p.onGrid(event.target.checked)} />Size grid</label><label className="editor-check"><input type="checkbox" checked={p.ruler} onChange={event => p.onRuler(event.target.checked)} />Ruler</label><button type="button" onClick={p.onClients}>{p.showClients ? 'Hide clients' : 'Show clients'}</button></div><span className="ribbon-caption">View options · never printed</span></div>}
    {p.kind === 'summary' && p.printing && p.tab !== 'View' && <div className="ribbon-group"><FormField label="Collection date"><input type="date" value={p.date} max={p.today} onChange={event => p.onDate(event.target.value)} /></FormField><span className="ribbon-caption">Daily collections</span></div>}
    {p.printing && p.tab === 'Insert' && p.kind === 'promissory' && <p className="ribbon-explanation">Choose a client and person in the picture panel. Images and signatures are used for this print session only.</p>}
  </div>;
}
