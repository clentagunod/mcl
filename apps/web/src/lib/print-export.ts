import { AlignmentType, Document, HeightRule, ImageRun, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, type FileChild } from 'docx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import noteTemplateUrl from '../templates/promissory.docx?url';
import type { Client } from '../types';
import { escapeHtml, renderPrintDocument, type PrintJob } from './print-renderer';
import { paperDimensions, promissoryValues, publicClientId } from './printables';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const mmToTwip = (mm: number) => Math.round(mm / 25.4 * 1440);
const safeFilename = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load a document asset (${response.status}). Please reload and try again.`);
  return new Uint8Array(await response.arrayBuffer());
}

function originalNote(job: PrintJob, client: Client, logo: Uint8Array, template: Uint8Array): Uint8Array {
  const files = unzipSync(template);
  const values = promissoryValues(client, job.settings);
  let xml = strFromU8(files['word/document.xml']);
  xml = xml.replace(/\{\{(\w+)\}\}/g, (_, key: string) => escapeHtml(values[key] ?? ''));
  if (/\{\{\w+\}\}/.test(xml)) throw new Error('An unresolved field was found in the note template.');
  const size = paperDimensions(job.layout, 'promissory');
  const margin = mmToTwip(job.layout.marginMm);
  xml = xml.replace(/<w:pgSz\b[^>]*\/>/, `<w:pgSz w:w="${mmToTwip(size.width)}" w:h="${mmToTwip(size.height)}" w:orient="${job.layout.orientation}"/>`)
    .replace(/<w:pgMar\b[^>]*\/>/, `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="0" w:footer="0" w:gutter="0"/>`)
    .replace(/<(w:sz|w:szCs) w:val="24"\s*\/>/g, `<$1 w:val="${job.layout.fontSize * 2}"/>`);
  const availableWidth = mmToTwip(size.width) - 2 * margin;
  const signatureIndent = Math.min(mmToTwip(12.7), Math.floor(availableWidth / 4));
  const signatureColumn = Math.floor((availableWidth - signatureIndent) / 2);
  xml = xml.replace(/<w:tbl>.*?<\/w:tbl>/gs, (table) => {
    if (!table.includes('Co-Maker Signature over Printed Name')) return table;
    return table.replace(/<w:tblW\b[^>]*\/>/, `<w:tblW w:w="${signatureColumn * 2}" w:type="dxa"/>`)
      .replace(/<w:tblInd\b[^>]*\/>/, `<w:tblInd w:w="${signatureIndent}" w:type="dxa"/>`)
      .replace(/<w:gridCol\b[^>]*\/>/g, `<w:gridCol w:w="${signatureColumn}"/>`)
      .replace(/<w:tcW\b[^>]*\/>/g, `<w:tcW w:w="${signatureColumn}" w:type="dxa"/>`);
  });
  // A compact logo in the title; all source paragraph/run structures are retained.
  const logoRun = '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="288000" cy="288000"/><wp:docPr id="9001" name="MCL logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="9001" name="MCL logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdMclLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="288000" cy="288000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t xml:space="preserve">  </w:t></w:r>';
  xml = xml.replace(/(<w:body>\s*<w:p\b[^>]*>\s*<w:pPr>.*?<\/w:pPr>)/s, `$1${logoRun}`);
  files['word/document.xml'] = strToU8(xml);
  files['word/media/mcl-logo.png'] = new Uint8Array(logo);
  const relPath = 'word/_rels/document.xml.rels';
  files[relPath] = strToU8(strFromU8(files[relPath]).replace('</Relationships>', '<Relationship Id="rIdMclLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/mcl-logo.png"/></Relationships>'));
  const contentTypes = strFromU8(files['[Content_Types].xml']);
  if (!/Extension="png"/.test(contentTypes)) files['[Content_Types].xml'] = strToU8(contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  return zipSync(files);
}

/** Native Word tables, rather than an HTML file disguised with a .doc extension. */
async function tableDocument(job: PrintJob, logo: Uint8Array): Promise<Uint8Array> {
  const parsed = new DOMParser().parseFromString(renderPrintDocument(job).html, 'text/html');
  const size = paperDimensions(job.layout, job.kind, Math.max(45, ...job.clients.map((c) => c.loanTermDays)));
  const font = job.layout.fontSize;
  const paragraph = (text: string, bold = false, centered = false, fill?: string, small = false) => new Paragraph({
    children: [new TextRun({ text, bold, font: job.kind === 'index' ? 'Aptos Narrow' : 'Calibri', size: Math.round(font * (small ? 1.65 : 2)) })],
    alignment: centered ? AlignmentType.CENTER : undefined,
    spacing: { before: 0, after: 0 },
    shading: fill ? { fill: fill.slice(1) } : undefined,
  });
  function table(element: HTMLTableElement): Table {
    const widths = element.classList.contains('summary-table') ? [3, 7, 9, 19, 9, 10, 15, 28] : [25, 25, 25, 25];
    const rows = [...element.rows].map((row) => {
      let column = 0;
      return new TableRow({
        tableHeader: row.parentElement?.tagName === 'THEAD',
        cantSplit: true, height: { value: mmToTwip(5.08), rule: HeightRule.ATLEAST },
        children: [...row.cells].map((cell) => {
          const cellWidth = widths.slice(column, column + cell.colSpan).reduce((a, b) => a + b, 0);
          column += cell.colSpan;
          const entry = cell.querySelector('.index-entry');
          const content = entry ? [...entry.children].map((e) => e.classList.contains('signature-line') ? '_____' : e.textContent).join('  ') : cell.textContent || '';
          const fill = cell.tagName === 'TH' ? 'e5ecf3' : job.kind === 'index' && !cell.classList.contains('unused-cell') ? job.settings.index.cellColor.slice(1) : undefined;
          return new TableCell({
            children: [paragraph(content, cell.tagName === 'TH', false, undefined, true)],
            columnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
            width: { size: cellWidth, type: WidthType.PERCENTAGE },
            shading: fill ? { fill } : undefined,
            margins: { top: 30, bottom: 30, left: 40, right: 40 },
          });
        }),
      });
    });
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  }
  const sections = [...parsed.querySelectorAll('.sheet')].map((sheet) => {
    const children: FileChild[] = [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 30, height: 30 } })], spacing: { after: 20 } })];
    const body = sheet.querySelector('.sheet-body')!;
    for (const element of body.children) {
      if (element.tagName === 'TABLE') children.push(table(element as HTMLTableElement));
      else if (element.classList.contains('index-heading')) children.push(paragraph(element.textContent || '', true, true, job.settings.index.headingColor));
      else if (element.classList.contains('index-details')) {
        const cells = [...element.children];
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [0, 2, 4].map((i) => new TableRow({ children: [0, 1].map((j) => new TableCell({ children: [paragraph(cells[i + j].textContent || '', true, false, undefined, true)], width: { size: j ? 25 : 75, type: WidthType.PERCENTAGE } })) })) }));
      } else if (element.classList.contains('summary-heading')) {
        children.push(paragraph(element.querySelector('h1')?.textContent || '', true, true));
        children.push(paragraph(element.querySelector('p')?.textContent || '', false, true));
        children.push(paragraph(element.querySelector('.summary-scope')?.textContent || '', false, true));
        children.push(paragraph(element.querySelector('.summary-meta')?.textContent || '', false, true));
      } else if (element.classList.contains('index-subheading')) {
        for (const line of element.children) children.push(paragraph(line.textContent || '', true, true));
      } else children.push(paragraph(element.textContent || '', false, false, undefined, true));
    }
    const margin = mmToTwip(job.layout.marginMm);
    return {
      properties: { page: { size: { width: mmToTwip(Math.min(size.width, size.height)), height: mmToTwip(Math.max(size.width, size.height)), orientation: job.layout.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: margin, bottom: margin, left: margin, right: margin } } },
      children,
    };
  });
  const doc = new Document({ creator: 'MCL Lending', title: job.kind, sections });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}

export async function exportDocx(job: PrintJob): Promise<void> {
  const logo = await fetchBytes(job.logoUrl);
  const noteTemplate = job.kind === 'promissory' ? await fetchBytes(noteTemplateUrl) : null;
  const files: Record<string, Uint8Array> = {};
  const selected = job.kind === 'summary' ? [null] : job.clients;
  if (!selected.length) throw new Error('Select at least one client.');
  for (const client of selected) {
    const name = safeFilename(`${job.kind}-${client ? publicClientId(client) : job.date}`) + '.docx';
    files[name] = noteTemplate && client ? originalNote(job, client, logo, noteTemplate) : await tableDocument({ ...job, clients: client ? [client] : job.clients }, logo);
  }
  const names = Object.keys(files);
  const bytes = names.length === 1 ? files[names[0]] : zipSync(files);
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: names.length === 1 ? DOCX_MIME : 'application/zip' }), names.length === 1 ? names[0] : `${job.kind}-${job.date}-docx.zip`);
}

export async function exportHtml(job: PrintJob): Promise<void> {
  const logo = await fetchBytes(job.logoUrl);
  const encoded = btoa(Array.from(logo, (byte) => String.fromCharCode(byte)).join(''));
  const document = renderPrintDocument({ ...job, logoUrl: `data:image/png;base64,${encoded}` });
  downloadBlob(new Blob([document.html], { type: 'text/html;charset=utf-8' }), `${job.kind}-${job.date}.html`);
}
