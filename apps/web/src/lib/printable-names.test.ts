import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/settings';
import type { Client } from '../types';
import { printablePartyNames, promissoryIdSlots, promissoryValues } from './printables';
import { renderPrintDocument, type PrintJob } from './print-renderer';

const client: Client = {
  id: 'party-names', firstName: 'Perlita', middleName: 'B.', lastName: 'Sakilan',
  address: 'San Miguel', cellphone: '', principal: 10000, interest: 1250,
  loanTermDays: 45, approvalDate: '2026-11-01',
};
const job = (kind: 'index' | 'promissory', selected: Client): PrintJob => ({
  kind, clients: [selected], payments: [], holidays: [], settings: DEFAULT_SETTINGS,
  layout: DEFAULT_SETTINGS.studio[kind], date: '2026-11-19', logoUrl: '/logo.png',
});
const openingParagraph = (html: string) => html.match(/<p class="note-p note-p-2"[\s\S]*?<\/p>/)?.[0];

describe('borrower and co-maker names in printables', () => {
  it('uses the slash format on the index card and opening promise while keeping separate signatures', () => {
    const selected = { ...client, coMaker: { name: '  Maria A. Reyes  ', contactNumber: '' } };
    expect(printablePartyNames(selected)).toBe('Perlita B. Sakilan/Maria A. Reyes');
    const index = renderPrintDocument(job('index', selected)).html;
    expect(index).toContain('Name: <b>Perlita B. Sakilan/Maria A. Reyes</b>');

    const note = renderPrintDocument(job('promissory', selected)).html;
    expect(openingParagraph(note)).toContain('PERLITA B. SAKILAN/MARIA A. REYES');
    const signatures = note.match(/<table class="note-signatures"[\s\S]*?<\/table>/)?.[0];
    expect(signatures).toContain('<b><u>PERLITA B. SAKILAN</u></b>');
    expect(signatures).toContain('<b><u>MARIA A. REYES</u></b>');
    expect(signatures).not.toContain('SAKILAN/MARIA');
    expect(promissoryIdSlots(selected, DEFAULT_SETTINGS.promissory).map(slot => slot.name))
      .toEqual(['PERLITA B. SAKILAN', 'MARIA A. REYES']);
    expect(selected.coMaker.name).toBe('  Maria A. Reyes  ');
  });

  it.each([undefined, { name: '', contactNumber: '' }, { name: ' \t\n ', contactNumber: '' }])(
    'retains the client-only format for an absent or blank co-maker (%j)', coMaker => {
      const selected: Client = { ...client, coMaker };
      expect(printablePartyNames(selected)).toBe('Perlita B. Sakilan');
      expect(renderPrintDocument(job('index', selected)).html).toContain('Name: <b>Perlita B. Sakilan</b>');
      const opening = openingParagraph(renderPrintDocument(job('promissory', selected)).html);
      expect(opening).toContain('>PERLITA B. SAKILAN<');
      expect(opening).not.toContain('SAKILAN/');
      expect(opening).not.toContain('N/A');
      expect(promissoryValues(selected, DEFAULT_SETTINGS).coMakerName).toBe('N/A');
    },
  );

  it('escapes both party names in rendered documents without changing their stored values', () => {
    const selected: Client = {
      ...client, firstName: 'Perlita & Ana', middleName: '',
      coMaker: { name: '<img src=x onerror=alert(1)> & Reyes', contactNumber: '' },
    };
    const index = renderPrintDocument(job('index', selected)).html;
    expect(index).toContain('Perlita &amp; Ana Sakilan/&lt;img src=x onerror=alert(1)&gt; &amp; Reyes');
    expect(index).not.toContain('<img src=x');
    const opening = openingParagraph(renderPrintDocument(job('promissory', selected)).html);
    expect(opening).toContain('PERLITA &amp; ANA SAKILAN/&lt;IMG SRC=X ONERROR=ALERT(1)&gt; &amp; REYES');
    expect(opening).not.toContain('<IMG SRC=X');
    expect(selected.coMaker?.name).toBe('<img src=x onerror=alert(1)> & Reyes');
  });
});
