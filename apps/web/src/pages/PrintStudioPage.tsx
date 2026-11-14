import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { EmptyState, LoadingState } from '../components/StateMessage';
import { ClientPrintSearch, type PrintClientSelection } from '../components/ClientPrintSearch';
import { StudioImageInspector } from '../components/StudioImageInspector';
import { PrintStudioRibbon, type RibbonTab } from '../components/PrintStudioRibbon';
import { Icon } from '../components/Icon';
import { validLayout, type PrintLayout, type PrintableKind } from '../config/settings';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { useStudioDrafts } from '../hooks/useStudioDrafts';
import { usePrintImageCanvas } from '../hooks/usePrintImageCanvas';
import { describeError } from '../lib/errors';
import { printableTitles, renderPrintDocument, type PrintJob } from '../lib/print-renderer';
import { fullClientName, paperDimensions, summaryClientName, summaryClients } from '../lib/printables';
import { boundImage, freshStudioDraft, PX_PER_MM, readPrintImage, type PrintImage } from '../lib/print-studio';
import { isISODate } from '../lib/dates';
import { ClientFormModal } from './clients/ClientFormModal';
import type { Client } from '../types';
import './print-studio.css';

const kinds: PrintableKind[] = ['index', 'promissory', 'summary'];
interface ViewOptions { zoom: number; grid: boolean; ruler: boolean; fit?: 'page' | 'width' }
const initialViews: Record<PrintableKind, ViewOptions> = {
  index: { zoom: 75, grid: false, ruler: true }, promissory: { zoom: 75, grid: false, ruler: true }, summary: { zoom: 75, grid: false, ruler: true },
};

export default function PrintStudioPage({ standalone = false }: { standalone?: boolean }) {
  const { user, signOut } = useAuth();
  const { clients, payments, holidays, today, loading, error: dataError } = useData();
  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<PrintableKind>('index');
  const studio = useStudioDrafts(kind);
  const { draft } = studio;
  const [ribbon, setRibbon] = useState<RibbonTab>('Home');
  const [views, setViews] = useState<Record<PrintableKind, ViewOptions>>(() => Object.fromEntries(kinds.map(item => [item, { ...initialViews[item], fit: undefined }])) as Record<PrintableKind, ViewOptions>);
  const view = views[kind];
  const [documentSelection, setDocumentSelection] = useState<PrintClientSelection>({ ids: null, bulk: false });
  const [summarySelection, setSummarySelection] = useState<PrintClientSelection>({ ids: null, bulk: true });
  const [mode, setMode] = useState<'printing' | 'view'>('printing');
  const [summaryDate, setSummaryDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editClientId, setEditClientId] = useState('');
  const [selectedImageId, setSelectedImageId] = useState('');
  const [party, setParty] = useState<PrintImage['party']>('client');
  const [lockAspect, setLockAspect] = useState(true);
  const [narrow, setNarrow] = useState(() => standalone && window.innerWidth <= 1100);
  const [showClients, setShowClients] = useState(() => !standalone || window.innerWidth > 1100);
  const [showPictures, setShowPictures] = useState(() => !standalone || window.innerWidth > 1100);
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [measured, setMeasured] = useState<{ source: string; height: number; overflow: boolean } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const idInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);
  const pendingFit = useRef('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!standalone) return;
    const media = window.matchMedia('(max-width: 1100px)');
    const update = () => { setNarrow(media.matches); setShowClients(!media.matches); setShowPictures(!media.matches); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [standalone]);

  const sortedClients = useMemo(() => [...clients].sort((a, b) => summaryClientName(a).localeCompare(summaryClientName(b))), [clients]);
  const date = summaryDate || today;
  const availableClients = useMemo(() => kind === 'summary'
    ? summaryClients(sortedClients, payments, date, settings.summary.onlyClientsWithPayments)
    : sortedClients, [kind, sortedClients, payments, date, settings.summary.onlyClientsWithPayments]);
  const isPrinting = mode === 'printing';
  const selection = kind === 'summary' ? summarySelection : documentSelection;
  const setSelection = kind === 'summary' ? setSummarySelection : setDocumentSelection;
  const initialId = params.get('client') ?? sortedClients[0]?.id;
  const selected = useMemo(() => {
    if (selection.ids === null) return kind === 'summary' ? availableClients : availableClients.filter(client => client.id === initialId);
    const ids = new Set(selection.ids);
    return availableClients.filter(client => ids.has(client.id));
  }, [selection.ids, kind, availableClients, initialId]);
  const selectedIds = useMemo(() => selected.map(client => client.id), [selected]);
  const clientToEdit = selected.find(client => client.id === editClientId) ?? selected[0];
  const layout = draft.layout ?? settings.studio[kind];
  const layoutValid = validLayout(layout);
  const effectiveSettings = useMemo(() => ({ ...settings, promissory: { ...settings.promissory, includeIdPage: settings.promissory.includeIdPage && draft.includeIdPage !== false } }), [settings, draft.includeIdPage]);
  const idUploadAllowed = useRef(false);
  idUploadAllowed.current = effectiveSettings.promissory.includeIdPage;
  const printableImages = useMemo(() => draft.images.filter(image => settings.promissory.includeIdPage || (image.purpose !== 'id' && image.page !== 'id')), [draft.images, settings.promissory.includeIdPage]);
  const job = useMemo<PrintJob>(() => ({ kind, clients: selected, totalClients: clients.length, payments, holidays, settings: effectiveSettings, layout, date, presentation: draft.presentation, images: printableImages,
    logoUrl: new URL(`${import.meta.env.BASE_URL}assets/logo.png`, window.location.origin).href,
  }), [kind, selected, clients.length, payments, holidays, effectiveSettings, layout, date, draft.presentation, printableImages]);
  const rendered = useMemo(() => {
    if (!selected.length || !layoutValid || !isISODate(date)) return { html: '', pages: 0, error: '' };
    try { return { ...renderPrintDocument(job), error: '' }; }
    catch (caught) { return { html: '', pages: 0, error: describeError(caught) }; }
  }, [job, layoutValid, date, selected.length]);
  const source = rendered.html;
  const dimensions = paperDimensions(layoutValid ? layout : settings.studio[kind], kind, Math.max(45, ...selected.map(client => client.loanTermDays)));
  const previewReady = measured?.source === source && !!source;
  const missingNumbers = selected.some(client => !client.transactionNumber || !client.clientNumber);
  const blocked = busy || uploading || loading || settingsLoading || !!settingsError || !!dataError || !layoutValid || !isISODate(date) || !source || !selected.length || missingNumbers;
  const visibleImages = printableImages.filter(image => selectedIds.includes(image.clientId));
  const selectedImage = visibleImages.find(image => image.id === selectedImageId);
  useEffect(() => { setActivePage(page => Math.min(page, Math.max(1, rendered.pages))); }, [rendered.pages]);
  useEffect(() => {
    const canvas = workspaceRef.current;
    if (!standalone || !view.fit || !canvas) return;
    const fit = () => {
      const widthScale = (canvas.clientWidth - 48) / (dimensions.width * PX_PER_MM);
      const heightScale = (canvas.clientHeight - (view.ruler ? 48 : 22)) / (dimensions.height * PX_PER_MM);
      const zoom = Math.max(20, Math.min(150, Math.floor((view.fit === 'page' ? Math.min(widthScale, heightScale) : widthScale) * 100)));
      setViews(previous => previous[kind].zoom === zoom ? previous : { ...previous, [kind]: { ...previous[kind], zoom } });
    };
    const observer = new ResizeObserver(fit); observer.observe(canvas); fit();
    return () => observer.disconnect();
  }, [standalone, kind, view.fit, view.ruler, dimensions.width, dimensions.height, loading, settingsLoading]);

  function changeView(patch: Partial<ViewOptions>) { setViews(previous => ({ ...previous, [kind]: { ...previous[kind], ...('zoom' in patch && !('fit' in patch) ? { fit: undefined } : {}), ...patch } })); }
  function toggleClients() { setShowClients(value => !value); if (narrow) setShowPictures(false); }
  function togglePictures() { setShowPictures(value => !value); if (narrow) setShowClients(false); }
  function changeLayout(next: PrintLayout) {
    studio.change(previous => ({ ...previous, layout: next, images: validLayout(next) ? previous.images.map(image => boundImage(image, paperDimensions(next, kind))) : previous.images }));
  }
  function commitImage(image: PrintImage, replace = false) {
    studio.change(previous => ({ ...previous, images: previous.images.map(item => item.id === image.id ? boundImage(image, dimensions) : item) }), replace);
  }
  function removeImage(id: string) { studio.change(previous => ({ ...previous, images: previous.images.filter(image => image.id !== id) })); setSelectedImageId(''); }
  usePrintImageCanvas({ document: frameDocument, images: printableImages, selectedId: selectedImageId, editable: isPrinting && kind === 'promissory' && !busy && !uploading,
    lockAspect, size: dimensions, select: setSelectedImageId, commit: commitImage, remove: removeImage, undo: studio.undo, redo: studio.redo, print: () => void print() });
  function selectDocument(next: PrintableKind) {
    setKind(next); setError(''); setNotice(''); setSelectedImageId(''); setActivePage(1);
    if (next !== 'promissory' && ribbon === 'Insert') setRibbon('Home');
  }
  function reset() {
    studio.change(() => freshStudioDraft()); setSelectedImageId(''); setViews(previous => ({ ...previous, [kind]: { ...initialViews[kind], fit: undefined } }));
    if (kind === 'summary') setSummaryDate('');
    setError(''); setNotice('Print options reset to saved defaults. Undo restores the previous draft.');
  }
  function fitImage(image: PrintImage, doc = frameDocument, replace = false) {
    const page = [...(doc?.querySelectorAll<HTMLElement>('[data-document-page]') ?? [])].find(node => node.dataset.clientId === image.clientId && node.dataset.documentPage === image.page);
    const target = image.page === 'id' ? page?.querySelector<HTMLElement>(`.id-placement-box[data-party="${image.party}"]`)
      : page?.querySelector<HTMLElement>(`.note-signatures tr:first-child td:nth-child(${image.party === 'co-maker' ? 1 : 2})`);
    if (!page || !target) { if (!replace) setError('Enable the ID attachment in Layout to fit this image to an ID box.'); return; }
    const sheet = page.getBoundingClientRect(), box = target.getBoundingClientRect();
    const maxWidth = box.width / PX_PER_MM * (image.purpose === 'signature' ? .75 : 1), maxHeight = image.purpose === 'signature' ? 15 : box.height / PX_PER_MM;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    commitImage({ ...image, width, height, rotation: 0,
      x: (box.left - sheet.left) / PX_PER_MM + (box.width / PX_PER_MM - width) / 2,
      y: (box.top - sheet.top) / PX_PER_MM + (image.purpose === 'signature' ? -height + 4 : (box.height / PX_PER_MM - height) / 2),
    }, replace);
  }
  async function upload(file: File | undefined, purpose: PrintImage['purpose']) {
    if (!file || !clientToEdit || kind !== 'promissory' || (purpose === 'id' && !idUploadAllowed.current)) return;
    if (draft.images.length >= 40) { setError('This session already has 40 images. Remove unused images before uploading another.'); return; }
    const clientId = clientToEdit.id;
    setUploading(true); setError(''); setNotice('');
    try {
      const pixels = await readPrintImage(file);
      if (!mounted.current || (purpose === 'id' && !idUploadAllowed.current)) return;
      const image = boundImage({ id: crypto.randomUUID(), clientId, party, purpose, page: purpose === 'id' ? 'id' : 'note', name: file.name,
        dataUrl: pixels.dataUrl, naturalWidth: pixels.width, naturalHeight: pixels.height, x: layout.marginMm + 10, y: 50,
        width: purpose === 'id' ? 80 : 40, height: (purpose === 'id' ? 80 : 40) / pixels.width * pixels.height,
        rotation: 0, flipX: false, flipY: false, opacity: 1, locked: false,
      }, dimensions);
      pendingFit.current = image.id;
      studio.change(previous => ({ ...previous, images: [...previous.images, image] }));
      setSelectedImageId(image.id);
      setShowPictures(true); if (narrow) setShowClients(false);
      setNotice(`${purpose === 'id' ? 'ID image' : 'E-signature'} added for ${fullClientName(clientToEdit)}. Uploads stay in this session and are cleared when you leave Print Studio.`);
    } catch (caught) { if (mounted.current) setError(describeError(caught)); }
    finally { if (mounted.current) setUploading(false); }
  }
  async function measure() {
    const frame = frameRef.current, doc = frame?.contentDocument;
    if (!doc || !frame) return;
    setFrameDocument(doc); await doc.fonts.ready;
    await Promise.allSettled([...doc.images].map(image => image.decode()));
    if (frame.contentDocument !== doc) return;
    const pending = draft.images.find(image => image.id === pendingFit.current);
    if (pending) { pendingFit.current = ''; fitImage(pending, doc, true); }
    const sheets = [...doc.querySelectorAll<HTMLElement>('.sheet')];
    if (pending) {
      const index = sheets.findIndex(sheet => sheet.dataset.clientId === pending.clientId && sheet.dataset.documentPage === pending.page);
      if (index >= 0) goToPage(index + 1);
    }
    const overflow = sheets.some(sheet => sheet.getBoundingClientRect().height > dimensions.height * PX_PER_MM + 3 || sheet.scrollWidth > sheet.clientWidth + 2);
    const height = sheets.reduce((total, sheet) => total + sheet.getBoundingClientRect().height + parseFloat(doc.defaultView!.getComputedStyle(sheet).marginBottom), 0);
    setMeasured({ source, height, overflow });
  }
  async function print(pdf = false) {
    if (!isPrinting || blocked || !previewReady || measured?.overflow) return;
    setSelectedImageId(''); setError('');
    try {
      const win = frameRef.current?.contentWindow;
      if (!win) throw new Error('The print preview is not ready. Please try again.');
      setNotice(pdf ? 'Choose “Save as PDF” in the print dialog. Use the preview paper size, 100% scale, background graphics on, and browser headers and footers off.' : 'Use the preview paper size and 100% scale. Enable background graphics and turn off browser headers and footers.');
      win.focus(); win.print();
    } catch (caught) { setError(describeError(caught)); }
  }
  async function exportFile(format: 'docx' | 'html') {
    if (!isPrinting || blocked) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { exportDocx, exportHtml } = await import('../lib/print-export');
      if (format === 'docx') await exportDocx(job); else await exportHtml(job);
      setNotice(format === 'docx' ? 'Word export prepared with your session images. Word may reflow text; PDF keeps the preview layout.' : 'Standalone HTML prepared with images embedded. Open it in a browser to view or print.');
    } catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
  }
  function goToPage(value: number) {
    const page = Math.max(1, Math.min(rendered.pages, value));
    const sheet = frameRef.current?.contentDocument?.querySelectorAll<HTMLElement>('.sheet')[page - 1];
    if (sheet && workspaceRef.current) workspaceRef.current.scrollTop = sheet.offsetTop * view.zoom / 100;
    setActivePage(page);
  }
  function fitWidth() { if (workspaceRef.current) changeView({ fit: standalone ? 'width' : undefined, zoom: Math.max(20, Math.min(150, Math.floor((workspaceRef.current.clientWidth - 48) / (dimensions.width * PX_PER_MM) * 100))) }); }
  function fitPage() { if (workspaceRef.current) changeView({ fit: undefined, zoom: Math.max(20, Math.min(150, Math.floor(Math.min((workspaceRef.current.clientWidth - 48) / (dimensions.width * PX_PER_MM), (workspaceRef.current.clientHeight - 48) / (dimensions.height * PX_PER_MM)) * 100))) }); }
  async function endSession() {
    setBusy(true); setError('');
    try { await signOut(); } catch (caught) { if (mounted.current) setError(describeError(caught)); }
    finally { if (mounted.current) setBusy(false); }
  }

  if (loading || settingsLoading) return <LoadingState />;
  return <section className={`print-editor${standalone ? ' is-fullscreen' : ''}${ribbonCollapsed ? ' ribbon-collapsed' : ''}`} aria-label="Print Studio editor" onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName) && isPrinting) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) studio.redo(); else studio.undo(); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); studio.redo(); }
    }
  }}>
    <header className="editor-titlebar"><div className="editor-brand"><span className="editor-brand-icon"><Icon name="documents" size={21} /></span><div><h1>Print Studio</h1><p>{printableTitles[kind]} <span>· Session workspace</span></p></div></div><div className="editor-title-actions">{standalone && <><Link to="/printables" aria-label="Main website (opens in a new tab)" target="_blank" rel="noopener noreferrer"><Icon name="arrow-up-right" size={15} /><span>Main website</span></Link><ThemeToggle /><button type="button" className="editor-signout" aria-label="Sign out" onClick={() => void endSession()} disabled={busy} title={user?.email || undefined}><Icon name="logout" size={15} /><span>Sign out</span></button></>}<Link to="/settings#settings-studio" aria-label="Template settings (opens in a new tab)" target="_blank" rel="noopener noreferrer"><Icon name="settings" size={16} /><span>Template settings</span></Link><span className="editor-session-indicator"><span />{uploading ? 'Reading image…' : 'Ready'}</span></div></header>
    <div className="editor-document-bar"><div role="tablist" aria-label="Printable document" className="editor-document-tabs">
      {kinds.map((item, index) => <button type="button" role="tab" id={`tab-${item}`} key={item} disabled={uploading || busy} aria-label={printableTitles[item]} aria-selected={kind === item} aria-controls="print-panel" tabIndex={kind === item ? 0 : -1} onClick={() => selectDocument(item)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? kinds[(index + 1) % 3] : event.key === 'ArrowLeft' ? kinds[(index + 2) % 3] : event.key === 'Home' ? kinds[0] : event.key === 'End' ? kinds[2] : null;
        if (next) { event.preventDefault(); selectDocument(next); document.getElementById(`tab-${next}`)?.focus(); }
      }}><Icon name={item === 'summary' ? 'wallet' : item === 'index' ? 'file' : 'documents'} size={16} /><span>{printableTitles[item]}</span></button>)}
    </div><fieldset className="editor-mode"><legend className="sr-only">Workspace mode</legend><label className={isPrinting ? 'active' : ''}><input type="radio" aria-label="Printing Mode" name="studio-mode" checked={isPrinting} onChange={() => setMode('printing')} />Printing Mode</label><label className={!isPrinting ? 'active' : ''}><input type="radio" aria-label="View Only" name="studio-mode" checked={!isPrinting} onChange={() => { setMode('view'); setSelectedImageId(''); }} />View Only</label></fieldset></div>
    <div className="editor-command-bar"><div className="editor-ribbon-tabs" role="tablist" aria-label="Editing tools">{(isPrinting ? (kind === 'promissory' ? ['Home', 'Layout', 'Insert', 'View'] : ['Home', 'Layout', 'View']) : ['View']).map(tab => <button type="button" role="tab" key={tab} aria-selected={(isPrinting ? ribbon : 'View') === tab} aria-controls="editor-ribbon" onClick={() => { setRibbon(tab as RibbonTab); setRibbonCollapsed(false); }}>{tab}</button>)}</div>
      <button type="button" className="editor-ribbon-toggle" aria-label={ribbonCollapsed ? "Expand ribbon" : "Collapse ribbon"} aria-expanded={!ribbonCollapsed} onClick={() => setRibbonCollapsed(value => !value)}><Icon name="chevron-down" size={15} /></button>
      {isPrinting && <div className="editor-output"><button type="button" className="editor-print-button" disabled={blocked || !previewReady || measured?.overflow} onClick={() => void print()}><Icon name="print" size={16} />Print</button><button type="button" disabled={blocked || !previewReady || measured?.overflow} onClick={() => void print(true)}>Save PDF</button><button type="button" disabled={blocked} onClick={() => void exportFile('docx')}>{busy ? 'Preparing…' : selected.length > 1 && kind !== 'summary' ? 'Export DOCX bundle' : 'Export DOCX'}</button><button type="button" disabled={blocked} onClick={() => void exportFile('html')}>Export HTML</button></div>}
    </div>
    {!ribbonCollapsed && <PrintStudioRibbon kind={kind} tab={ribbon} printing={isPrinting} layout={layout} presentation={draft.presentation} busy={busy || uploading} canEdit={!!clientToEdit && !dataError && !settingsError} canUndo={studio.canUndo} canRedo={studio.canRedo} includeIdPage={effectiveSettings.promissory.includeIdPage} allowIdPage={settings.promissory.includeIdPage} date={date} today={today} grid={view.grid} ruler={view.ruler} showClients={showClients}
      onLayout={changeLayout} onPresentation={patch => studio.change(previous => ({ ...previous, presentation: { ...previous.presentation, ...patch } }))} onIdPage={enabled => studio.change(previous => ({ ...previous, includeIdPage: enabled }))} onDate={setSummaryDate} onGrid={grid => changeView({ grid })} onRuler={ruler => changeView({ ruler })} onClients={toggleClients} onFit={fitWidth} onFitPage={fitPage} onActualSize={() => changeView({ zoom: 100 })} onUndo={studio.undo} onRedo={studio.redo} onReset={reset} onEdit={() => setEditingClient(clientToEdit)} onId={() => idInput.current?.click()} onSignature={() => signatureInput.current?.click()} />}
        {effectiveSettings.promissory.includeIdPage && <input ref={idInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="ID image file" className="editor-file-input" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file, 'id'); }} />}<input ref={signatureInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="E-signature file" className="editor-file-input" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file, 'signature'); }} />
    <div className="editor-notices" aria-live="polite">{dataError && <p className="alert alert-error" role="alert">{dataError}</p>}{settingsError && <p className="alert alert-error" role="alert">{settingsError}</p>}{!layoutValid && <p className="alert alert-error" role="alert">Paper dimensions must be 70–600 mm, margins 0–30 mm and font size 6–18 pt.</p>}{missingNumbers && <p className="alert alert-warning" role="status">Client numbers are being completed. Use “Complete existing client records” in Settings if this persists.</p>}{rendered.error && <p className="alert alert-error" role="alert">{rendered.error}</p>}{previewReady && measured?.overflow && <p className="alert alert-warning" role="alert">Some content exceeds the selected paper size. Increase the paper size, reduce the font or margins, or shorten template text before printing.</p>}{error && <p className="alert alert-error" role="alert">{error}</p>}{notice && <p className="alert alert-info" role="status">{notice}<button type="button" className="editor-notice-dismiss" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" size={14} /></button></p>}</div>
    <div id="print-panel" role="tabpanel" aria-labelledby={`tab-${kind}`} className={`editor-body${showClients ? '' : ' editor-clients-hidden'}${kind === 'promissory' && isPrinting && showPictures ? ' editor-with-inspector' : ''}`}>
      {showClients && <aside id="editor-clients-pane" className="editor-clients" aria-label="Client selection"><div className="editor-panel-heading"><h2>Clients</h2><span>{selected.length} selected</span>{standalone && <button type="button" className="editor-panel-close" aria-label="Close clients panel" onClick={() => setShowClients(false)}><Icon name="close" size={16} /></button>}</div><ClientPrintSearch clients={availableClients} selectedIds={selectedIds} bulk={selection.bulk} onChange={setSelection} /><p className="editor-help">{kind === 'summary' ? settings.summary.onlyClientsWithPayments ? 'Only clients with payments on the collection date are shown. The total covers selected clients.' : 'The total covers selected clients. Collections from every collector are retained.' : kind === 'index' ? 'Sequential paying days follow recorded payments. Due dates follow the saved loan schedule.' : 'Empty co-maker fields print as N/A. Edit note information to update saved client details.'}</p></aside>}
      {standalone && narrow && (showClients || (showPictures && kind === 'promissory' && isPrinting)) && <button type="button" className="editor-panel-backdrop" aria-label="Close side panel" onClick={() => { setShowClients(false); setShowPictures(false); }} />}
      <main className="editor-document-area" aria-label="Document canvas"><div className="editor-canvas-heading"><div className="editor-panel-toggles"><button type="button" aria-label="Toggle clients panel" aria-controls="editor-clients-pane" aria-pressed={showClients} onClick={toggleClients}><Icon name="clients" size={14} />Clients</button>{kind === 'promissory' && isPrinting && <button type="button" aria-label="Toggle pictures panel" aria-controls="editor-pictures-pane" aria-pressed={showPictures} onClick={togglePictures}><Icon name="image" size={14} />Pictures</button>}</div><span className="editor-paper-description">{dimensions.width.toFixed(1)} ? {dimensions.height.toFixed(1)} mm</span><button type="button" aria-label="Fit page to screen" onClick={fitPage}>Fit page</button><button type="button" aria-label="Fit page to width" onClick={fitWidth}>Fit width</button></div>
        <div ref={workspaceRef} onScroll={event => { const canvas = event.currentTarget; const pageHeight = (dimensions.height + 8) * PX_PER_MM * view.zoom / 100; setActivePage(Math.max(1, Math.min(rendered.pages || 1, Math.floor((canvas.scrollTop + canvas.clientHeight * .3) / pageHeight) + 1))); }} className={`studio-workspace editor-canvas${view.grid ? ' with-grid' : ''}`} style={{ backgroundSize: `${37.795 * view.zoom / 100}px ${37.795 * view.zoom / 100}px` }}>
          {source && selected.length ? <div className="editor-pages" style={{ width: dimensions.width * PX_PER_MM * view.zoom / 100 }}>{view.ruler && <div className="editor-ruler" aria-label="Millimetre ruler">{Array.from({ length: Math.floor(dimensions.width / 10) + 1 }, (_, index) => <span key={index} style={{ left: `${index * 10 / dimensions.width * 100}%` }}>{index * 10}</span>)}</div>}<div style={{ height: (measured?.source === source ? measured.height : dimensions.height * PX_PER_MM * rendered.pages) * view.zoom / 100 }}><iframe key={`${kind}-${mode}`} ref={frameRef} title={`${printableTitles[kind]} print preview`} className="print-preview" sandbox={isPrinting ? 'allow-same-origin allow-modals' : 'allow-same-origin'} srcDoc={source} onLoad={() => void measure()} style={{ width: `${dimensions.width}mm`, height: measured?.source === source ? measured.height : dimensions.height * PX_PER_MM * rendered.pages, transform: `scale(${view.zoom / 100})`, transformOrigin: 'top left' } as CSSProperties} /></div></div>
            : <div className="editor-empty"><Icon name="documents" size={40} /><h2>{clients.length ? 'Your document starts here' : 'No clients yet'}</h2><EmptyState>{clients.length ? kind === 'summary' && !availableClients.length && settings.summary.onlyClientsWithPayments ? 'No clients have payments on this collection date. Choose another date or turn off the filter in Settings / Daily Summary Sheet.' : 'Select a client in the left panel to prepare a document.' : 'Add a client before preparing print documents.'}</EmptyState></div>}
        </div>
      </main>
      {kind === 'promissory' && isPrinting && showPictures && <aside id="editor-pictures-pane" className="editor-pictures" aria-label="Pictures and signatures"><div className="editor-panel-heading"><h2>Pictures</h2><span className="editor-local-tag">Session only</span>{standalone && <button type="button" className="editor-panel-close" aria-label="Close pictures panel" onClick={() => setShowPictures(false)}><Icon name="close" size={16} /></button>}</div><FormField label="Client to edit"><select value={clientToEdit?.id ?? ''} disabled={!selected.length || uploading} onChange={event => { setEditClientId(event.target.value); setSelectedImageId(''); }}>{!selected.length && <option value="">Select a client first</option>}{selected.map(client => <option key={client.id} value={client.id}>{summaryClientName(client)} ({client.clientNumber || client.id})</option>)}</select></FormField><FormField label="Image belongs to"><select value={party} onChange={event => setParty(event.target.value as PrintImage['party'])}><option value="client">Client / Borrower</option><option value="co-maker">Co-maker</option></select></FormField>

        {standalone && visibleImages.length > 0 ? <FormField label="Picture to edit"><select value={selectedImage?.id ?? ''} onChange={event => { const image = visibleImages.find(item => item.id === event.target.value); setSelectedImageId(image?.id ?? ''); if (image) setEditClientId(image.clientId); }}><option value="">Select a picture</option>{visibleImages.map(image => <option key={image.id} value={image.id}>{image.party === 'client' ? 'Client' : 'Co-maker'} ? {image.name}</option>)}</select></FormField> : <div className="editor-image-list" aria-label="Uploaded pictures">{visibleImages.map(image => <button type="button" key={image.id} aria-pressed={selectedImageId === image.id} onClick={() => { setSelectedImageId(image.id); setEditClientId(image.clientId); }}><img src={image.dataUrl} alt="" /><span><strong>{image.purpose === 'id' ? 'ID image' : 'E-signature'} · {image.party === 'client' ? 'Client' : 'Co-maker'}</strong><small>{image.name}</small></span>{image.locked && <Icon name="shield" size={13} />}</button>)}</div>}
        {selectedImage ? <StudioImageInspector key={selectedImage.id} compact={standalone} allowIdPage={effectiveSettings.promissory.includeIdPage} image={selectedImage} lockAspect={lockAspect} onLockAspect={setLockAspect} onChange={patch => commitImage({ ...selectedImage, ...patch })} onFit={() => fitImage(selectedImage)} onRemove={() => removeImage(selectedImage.id)} onDuplicate={() => { if (draft.images.length >= 40) { setError('Remove unused images before duplicating another.'); return; } const copy = boundImage({ ...selectedImage, id: crypto.randomUUID(), x: selectedImage.x + 5, y: selectedImage.y + 5, locked: false }, dimensions); studio.change(previous => ({ ...previous, images: [...previous.images, copy] })); setSelectedImageId(copy.id); }} onLayer={front => studio.change(previous => ({ ...previous, images: front ? [...previous.images.filter(image => image.id !== selectedImage.id), selectedImage] : [selectedImage, ...previous.images.filter(image => image.id !== selectedImage.id)] }))} />
          : <div className="editor-picture-empty"><Icon name="image" size={30} /><h3>Make it print-ready</h3><p>Insert an ID or signature from the ribbon, then select it to adjust its position and appearance.</p><p>PNG, JPEG or WebP · up to 10 MB</p></div>}
        <p className="editor-privacy"><Icon name="shield" size={14} />Uploads stay on this device for this workspace session. Leaving or refreshing clears them.</p>
      </aside>}
    </div>
    <footer className="editor-statusbar"><div className="editor-page-navigation"><button type="button" aria-label="Previous page" disabled={activePage <= 1} onClick={() => goToPage(activePage - 1)}><Icon name="chevron-left" size={15} /></button><label>Page<input aria-label="Page number" type="number" min="1" max={Math.max(1, rendered.pages)} value={Math.min(activePage, Math.max(1, rendered.pages))} onChange={event => goToPage(Number(event.target.value) || 1)} />of {rendered.pages || '—'}</label><button type="button" aria-label="Next page" disabled={activePage >= rendered.pages} onClick={() => goToPage(activePage + 1)}><Icon name="chevron-right" size={15} /></button></div><span className="editor-status-caption">{selected.length} {selected.length === 1 ? 'client' : 'clients'}<span className={previewReady && !measured?.overflow ? 'editor-ready-dot' : 'editor-pending-dot'} />{previewReady ? measured?.overflow ? 'Check page size' : 'Print-ready' : 'Preparing preview'}</span><div className="editor-zoom"><button type="button" aria-label="Zoom out" onClick={() => changeView({ zoom: Math.max(20, view.zoom - 10) })}>−</button><label>Zoom<select aria-label="Zoom" value={view.zoom} onChange={event => changeView({ zoom: Number(event.target.value) })}>{[...new Set([25, 40, 50, 60, 75, 100, 125, 150, view.zoom])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}%</option>)}</select></label><button type="button" aria-label="Zoom in" onClick={() => changeView({ zoom: Math.min(150, view.zoom + 10) })}>+</button></div></footer>
    {editingClient && <ClientFormModal client={editingClient} promissory={kind === 'promissory'} onClose={() => setEditingClient(null)} />}
  </section>;
}
