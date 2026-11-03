import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '@web/config/settings';
import type { Client, Payment } from '@web/types';
import { paperDimensions } from '@web/lib/printables';
import { renderPrintDocument } from '@web/lib/print-renderer';

/** Isolate the website's exact print CSS from mobile app styles. */
export function WebIndexCard({ client, payments, settings, date }: {
  client: Client; payments: readonly Payment[]; settings: AppSettings; date: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(300);
  const [zoom, setZoom] = useState<number | null>(1.25);
  const [previewHeight, setPreviewHeight] = useState(() => Math.max(200, Math.min(520, window.innerHeight * .5)));
  const layout = settings.studio.index;
  const document = useMemo(() => renderPrintDocument({
    kind: 'index', clients: [client], payments, settings, layout, date,
    logoUrl: new URL(import.meta.env.BASE_URL + 'assets/logo.png', window.location.href.split('#')[0]).href,
  }), [client, payments, settings, layout, date]);
  const size = paperDimensions(layout, 'index', Math.max(45, client.loanTermDays));
  const width = size.width * 96 / 25.4;
  const height = (size.height * document.pages + 8 * (document.pages - 1)) * 96 / 25.4;
  const fit = Math.min(1, availableWidth / width);
  const scale = zoom ?? fit;
  useLayoutEffect(() => {
    const element = viewport.current!;
    const update = () => {
      setAvailableWidth(Math.max(1, element.clientWidth - 2));
      setPreviewHeight(Math.max(200, Math.min(520, window.innerHeight * .5)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return <>
    <div className="zoom-controls">
      <button className="btn" aria-label="Zoom out" onClick={() => setZoom(Math.max(.2, scale - .15))}>−</button>
      <output aria-label="Card zoom">{Math.round(scale * 100)}%</output>
      <button className="btn" aria-label="Zoom in" onClick={() => setZoom(Math.min(2.4, scale + .15))}>+</button>
      <button className="btn" onClick={() => setZoom(null)}>Fit</button>
      <button className="btn" onClick={() => setZoom(1)}>100%</button>
    </div>
    <p className="muted small">Swipe across and scroll down to read the card. Use Fit for a full-card overview.</p>
    <div ref={viewport} className="index-scroll" aria-label="Index card preview" tabIndex={0}
      style={{ height: previewHeight, minHeight: 0, maxHeight: "none", flexShrink: 0 }}>
      <div style={{ position: 'relative', width: width * scale, height: height * scale }}>
        <iframe title="Web index card" tabIndex={-1} sandbox="allow-same-origin" srcDoc={document.html}
          style={{ position: 'absolute', left: 0, top: 0, width, height, border: 0,
            transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff', pointerEvents: 'none' }} />
      </div>
    </div>
  </>;
}
