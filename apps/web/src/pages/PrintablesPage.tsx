import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { PrintLayoutFields } from '../components/PrintLayoutFields';
import { EmptyState, LoadingState } from '../components/StateMessage';
import { validLayout, type PrintLayout, type PrintableKind } from '../config/settings';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { describeError } from '../lib/errors';
import { printableTitles, renderPrintDocument, type PrintJob } from '../lib/print-renderer';
import { paperDimensions, summaryClientName } from '../lib/printables';
import { isISODate } from '../lib/dates';
import { ClientPrintSearch, type PrintClientSelection } from '../components/ClientPrintSearch';
import { Icon } from '../components/Icon';
import './report-workspaces.css';

const kinds: PrintableKind[] = ['index', 'promissory', 'summary'];
const documentDescriptions: Record<PrintableKind, string> = {
  index: 'Payment record for each borrower',
  promissory: 'Loan agreement with borrower details',
  summary: 'Collections for a selected date',
};

export default function PrintablesPage() {
  const { clients, payments, holidays, today, loading, error: dataError } = useData();
  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<PrintableKind>('index');
  const [overrides, setOverrides] = useState<Partial<Record<PrintableKind, PrintLayout>>>({});
  const [documentSelection, setDocumentSelection] = useState<PrintClientSelection>({ ids: null, bulk: false });
  const [summarySelection, setSummarySelection] = useState<PrintClientSelection>({ ids: null, bulk: true });
  const [mode, setMode] = useState<'printing' | 'view'>('printing');
  const [summaryDate, setSummaryDate] = useState('');
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState(75);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [measured, setMeasured] = useState<{ source: string; height: number; overflow: boolean } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sortedClients = useMemo(() => [...clients].sort((a, b) => summaryClientName(a).localeCompare(summaryClientName(b))), [clients]);
  const isPrinting = mode === 'printing';
  const selection = kind === 'summary' ? summarySelection : documentSelection;
  const setSelection = kind === 'summary' ? setSummarySelection : setDocumentSelection;
  const initialId = params.get('client') ?? sortedClients[0]?.id;
  const selected = useMemo(() => {
    if (selection.ids === null) return kind === 'summary' ? sortedClients : sortedClients.filter((client) => client.id === initialId);
    const ids = new Set(selection.ids);
    return sortedClients.filter((client) => ids.has(client.id));
  }, [selection.ids, kind, sortedClients, initialId]);
  const selectedIds = useMemo(() => selected.map((client) => client.id), [selected]);
  const date = summaryDate || today;
  const layout = overrides[kind] ?? settings.studio[kind];
  const layoutValid = validLayout(layout);
  const job = useMemo<PrintJob>(() => ({ kind, clients: selected, totalClients: clients.length, payments, holidays, settings, layout, date, logoUrl: new URL(`${import.meta.env.BASE_URL}assets/logo.png`, window.location.origin).href }), [kind, selected, clients.length, payments, holidays, settings, layout, date]);
  const rendered = useMemo(() => {
    if (!selected.length || !layoutValid || !isISODate(date)) return { html: '', pages: 0, error: '' };
    try { return { ...renderPrintDocument(job), error: '' }; }
    catch (caught) { return { html: '', pages: 0, error: describeError(caught) }; }
  }, [job, layoutValid, date, selected.length]);
  const source = rendered.html;
  const dimensions = paperDimensions(layoutValid ? layout : settings.studio[kind], kind, Math.max(45, ...selected.map((c) => c.loanTermDays)));
  const previewReady = measured?.source === source && !!source;
  const missingNumbers = selected.some((c) => !c.transactionNumber || !c.clientNumber);
  const blocked = busy || loading || settingsLoading || !!settingsError || !!dataError || !layoutValid || !isISODate(date) || !source || !selected.length || missingNumbers;

  function selectDocument(next: PrintableKind) {
    setKind(next); setError(''); setNotice('');
  }

  function reset() {
    setOverrides((previous) => ({ ...previous, [kind]: undefined }));
    setSummaryDate(''); setGrid(true); setZoom(75);
    setError(''); setNotice('Print options reset to saved defaults.');
  }
  async function measure() {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc || !frame) return;
    await doc.fonts.ready;
    await Promise.allSettled([...doc.images].map((img) => img.decode()));
    if (frame.contentDocument !== doc) return;
    const expected = dimensions.height / 25.4 * 96;
    const sheets = [...doc.querySelectorAll<HTMLElement>('.sheet')];
    const overflow = sheets.some((sheet) => sheet.getBoundingClientRect().height > expected + 3 || sheet.scrollWidth > sheet.clientWidth + 2);
    const height = sheets.reduce((total, sheet) => total + sheet.getBoundingClientRect().height + parseFloat(doc.defaultView!.getComputedStyle(sheet).marginBottom), 0);
    setMeasured({ source, height, overflow });
  }
  async function print(pdf = false) {
    if (!isPrinting || blocked || !previewReady || measured?.overflow) return;
    setError('');
    try {
      const win = frameRef.current?.contentWindow;
      if (!win) throw new Error('The print preview is not ready. Please try again.');
      setNotice(pdf ? 'Choose “Save as PDF” in the print dialog. Match the preview paper size, use 100% scale, turn on background graphics, and turn off browser headers and footers.' : 'Match the preview paper size, use 100% scale, enable background graphics, and turn off browser headers and footers.');
      win.focus(); win.print();
    } catch (caught) { setError(describeError(caught)); }
  }
  async function exportFile(format: 'docx' | 'html') {
    if (!isPrinting || blocked) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { exportDocx, exportHtml } = await import('../lib/print-export');
      if (format === 'docx') await exportDocx(job); else await exportHtml(job);
      setNotice(format === 'docx' ? 'Word export prepared. Word may reflow content; use Save PDF for the preview layout.' : 'Standalone HTML prepared with the logo embedded. Open it in a browser to view or print.');
    } catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
  }

  if (loading || settingsLoading) return <LoadingState />;

  return <>
    <PageHeader title="Print studio" description="Choose a document, select your clients, then review and print." actions={isPrinting ? <Link className="btn" to="/settings"><Icon name="settings" /> Template settings</Link> : undefined} />
    <div className="studio-mode-bar print-workspace-mode">
      <fieldset className="studio-mode-switch"><legend>Workspace mode</legend>
        <label className={isPrinting ? 'studio-mode active' : 'studio-mode'}><input type="radio" name="studio-mode" checked={isPrinting} onChange={() => { setMode('printing'); setMeasured(null); setNotice(''); setError(''); }} /> Printing Mode</label>
        <label className={!isPrinting ? 'studio-mode active' : 'studio-mode'}><input type="radio" name="studio-mode" checked={!isPrinting} onChange={() => { setMode('view'); setMeasured(null); setNotice(''); setError(''); }} /> View Only</label>
      </fieldset>
      <p className="muted small"><Icon name="info" />{isPrinting ? 'Print-ready documents using your saved templates.' : 'Review client documents without changing print options.'}</p>
    </div>
    <div className="studio-section-label"><span className="workspace-step">1</span><span>Choose a document</span></div>
    <div className="print-tabs document-type-tabs" role="tablist" aria-label="Printable document">
      {kinds.map((item, index) => <button key={item} type="button" role="tab" id={`tab-${item}`} aria-label={printableTitles[item]} aria-selected={kind === item} aria-controls="print-panel" tabIndex={kind === item ? 0 : -1} className={kind === item ? 'print-tab selected' : 'print-tab'} onClick={() => selectDocument(item)} onKeyDown={(event) => {
        const next = event.key === 'ArrowRight' ? kinds[(index + 1) % kinds.length]
          : event.key === 'ArrowLeft' ? kinds[(index + kinds.length - 1) % kinds.length]
            : event.key === 'Home' ? kinds[0] : event.key === 'End' ? kinds[kinds.length - 1] : null;
        if (next) { event.preventDefault(); selectDocument(next); document.getElementById(`tab-${next}`)?.focus(); }
      }}><span className="document-type-icon"><Icon name={item === 'summary' ? 'wallet' : item === 'index' ? 'documents' : 'file'} /></span><span><strong>{printableTitles[item]}</strong><small>{documentDescriptions[item]}</small></span>{kind === item && <Icon name="check" className="document-type-check" />}</button>)}
    </div>
    <section id="print-panel" className="print-workspace-panel" role="tabpanel" aria-labelledby={`tab-${kind}`}>
      <div className="print-studio">
        <aside className="studio-controls card" aria-label="Document controls">
          <div className="studio-section-label"><span className="workspace-step">2</span><h2>Choose clients</h2></div>
          <ClientPrintSearch clients={sortedClients} selectedIds={selectedIds} bulk={selection.bulk} onChange={setSelection} />
          {kind === 'summary' ? <>
            <FormField label="Collection date"><input type="date" value={date} max={today} onChange={(e) => setSummaryDate(e.target.value)} /></FormField>
            <p className="field-hint">The report includes checked clients, with zero shown for those without payments on this date. Multiple collectors and notes are retained. The grand total covers the selected clients.</p>
          </> : <>
            <p className="field-hint">{kind === 'index' ? `Due date follows the client’s loan schedule. ${settings.schedule.skipSundays ? 'Sundays and registered holidays are excluded.' : 'Sundays count; registered holidays are excluded.'} Paying days have no gaps for missed dates; signature spaces stay blank.` : 'Client details fill the supplied note. IDs, co-maker information and signatures stay blank.'}</p>
          </>}
          {isPrinting && <section className="studio-layout-section"><div className="studio-divider" />
            <h3><Icon name="settings" /> Paper &amp; layout</h3>
            <p className="field-hint">Your saved template is ready to use. Adjust only when needed.</p>
            <PrintLayoutFields value={layout} onChange={(value) => setOverrides((previous) => ({ ...previous, [kind]: value }))} />
          </section>}
          {!layoutValid && <p className="alert alert-error" role="alert">Paper dimensions must be 70–600 mm, margins 0–30 mm and font size 6–18 pt.</p>}
          <p className="field-hint">Paper: {dimensions.width.toFixed(1)} × {dimensions.height.toFixed(1)} mm. Layout changes apply only to this session.</p>
          {isPrinting && <button type="button" className="btn btn-block" onClick={reset} disabled={busy}>Reset print options</button>}
        </aside>
        <div className="studio-main">
          <div className="studio-preview-heading"><div className="studio-section-label"><span className="workspace-step">3</span><h2>{isPrinting ? 'Review & finish' : 'Document preview'}</h2></div><span className="studio-preview-status"><span className={previewReady && !measured?.overflow ? 'preview-status-dot ready' : 'preview-status-dot'} />{previewReady ? `${rendered.pages} ${rendered.pages === 1 ? 'page' : 'pages'} · ${selected.length} ${selected.length === 1 ? 'client' : 'clients'}` : selected.length ? 'Preparing preview' : 'Select a client'}</span></div>
          <div className="studio-actions card">
            {isPrinting && <div className="studio-output-actions"><div className="studio-action-group"><button type="button" className="btn btn-primary" disabled={blocked || !previewReady || measured?.overflow} onClick={() => void print()}><Icon name="print" />Print</button><button type="button" className="btn" title="Open the print dialog and choose Save as PDF" disabled={blocked || !previewReady || measured?.overflow} onClick={() => void print(true)}><Icon name="download" />Save PDF</button></div><div className="studio-action-group studio-export-actions" aria-label="Other export formats"><button type="button" className="btn" title="Download an editable Word document" disabled={blocked} onClick={() => void exportFile('docx')}>{busy ? 'Preparing…' : selected.length > 1 && kind !== 'summary' ? 'Export DOCX bundle' : 'Export DOCX'}</button><button type="button" className="btn" title="Download a standalone document to open in a browser" disabled={blocked} onClick={() => void exportFile('html')}>Export HTML</button></div></div>}
            <div className="studio-preview-tools"><label className="check-label"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Size grid</label><label className="zoom-control">Zoom<select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>{[40, 50, 60, 75, 100, 125].map((n) => <option key={n} value={n}>{n}%</option>)}</select></label><span className="muted small">Preview only</span></div>
          </div>
          {missingNumbers && <p className="alert alert-warning" role="status">Client numbers are being completed. If this persists, use “Complete existing client records” in Settings.</p>}
          {rendered.error && <p className="alert alert-error" role="alert">{rendered.error}</p>}
          {previewReady && measured?.overflow && <p className="alert alert-warning" role="alert">Some content exceeds the selected paper size. Increase the paper size, reduce the font or margins, or shorten the template text before printing. HTML and Word exports retain all content.</p>}
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {notice && <p className="alert alert-info" role="status">{notice}</p>}
          {source && selected.length > 0 ? <div className={grid ? 'studio-workspace with-grid' : 'studio-workspace'} style={{ backgroundSize: `${37.795 * zoom / 100}px ${37.795 * zoom / 100}px` }}>
            <div className="workspace-size">{dimensions.width.toFixed(1)} mm × {dimensions.height.toFixed(1)} mm · grid 10 mm · {selected.length} {selected.length === 1 ? 'client' : 'clients'}</div>
            <div style={{ width: `${dimensions.width / 25.4 * 96 * zoom / 100}px`, height: `${(measured?.source === source ? measured.height : dimensions.height / 25.4 * 96) * zoom / 100}px` }}>
              <iframe key={`${kind}-${mode}`} ref={frameRef} title={`${printableTitles[kind]} print preview`} className="print-preview" sandbox={isPrinting ? 'allow-same-origin allow-modals' : 'allow-same-origin'} srcDoc={source} onLoad={() => void measure()} style={{ width: `${dimensions.width}mm`, height: `${measured?.source === source ? measured.height : dimensions.height / 25.4 * 96}px`, transform: `scale(${zoom / 100})`, transformOrigin: 'top left' } as CSSProperties} />
            </div>
          </div> : <section className="card"><EmptyState>{clients.length ? 'Choose a client and valid paper settings to preview.' : 'Add a client to start preparing documents.'}</EmptyState></section>}
          <p className="studio-footnote">{isPrinting ? 'PDF uses your browser’s print dialog. Enable background graphics for the reference colors. The size grid stays in the workspace and is excluded from every export.' : 'View Only mode uses the same document layout as printing. Client and date choices only change your inspection preview.'}</p>
        </div>
      </div>
    </section>
  </>;
}
