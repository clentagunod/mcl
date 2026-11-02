import { useId, useMemo, useState } from 'react';
import type { Client } from '../types';
import { searchClients } from '../lib/client-search';
import { publicClientId, summaryClientName } from '../lib/printables';
import { FormField } from './FormField';

export interface PrintClientSelection {
  /** Null uses the initial selection (first client, or all for the daily summary). */
  ids: string[] | null;
  bulk: boolean;
}

interface ClientPrintSearchProps {
  clients: readonly Client[];
  selectedIds: readonly string[];
  bulk: boolean;
  onChange: (selection: PrintClientSelection) => void;
}

export function ClientPrintSearch({ clients, selectedIds, bulk, onChange }: ClientPrintSearchProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const groupId = useId();
  const results = useMemo(() => searchClients(clients, query), [clients, query]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const matchingSelected = results.filter((client) => selected.has(client.id)).length;
  const allMatchesSelected = results.length > 0 && matchingSelected === results.length;

  function selectClient(client: Client) {
    const ids = bulk ? selected.has(client.id) ? selectedIds.filter((id) => id !== client.id) : [...selectedIds, client.id] : [client.id];
    onChange({ ids, bulk });
  }
  function selectMatches() {
    const matches = new Set(results.map((client) => client.id));
    onChange({ bulk: true, ids: allMatchesSelected ? selectedIds.filter((id) => !matches.has(id)) : [...new Set([...selectedIds, ...matches])] });
  }

  return <div className="client-print-search">
    <FormField label="Search clients" hint="Name, client ID or transaction number. Words can be in any order.">
      <input type="search" value={query} autoComplete="off" placeholder="e.g. Juan Cruz or mcl0001"
        onChange={(event) => { setQuery(event.target.value); setLimit(50); }} aria-controls={`${groupId}-results`} />
    </FormField>
    <label className="check-label bulk-toggle"><input type="checkbox" checked={bulk}
      onChange={(event) => onChange({ bulk: event.target.checked, ids: event.target.checked ? [...selectedIds] : selectedIds.slice(0, 1) })} /> Bulk printing</label>
    {bulk && <div className="client-selection-tools">
      <label className="check-label"><input type="checkbox" ref={(element) => {
        if (element) element.indeterminate = matchingSelected > 0 && !allMatchesSelected;
      }} checked={allMatchesSelected} disabled={!results.length} onChange={selectMatches} /> Select all matches</label>
      <button type="button" className="btn btn-small" disabled={!selectedIds.length} onClick={() => onChange({ ids: [], bulk: true })}>Clear selection</button>
    </div>}
    <p className="client-selection-count small" role="status">{selectedIds.length} selected · {results.length} {results.length === 1 ? 'match' : 'matches'}</p>
    <ul className="client-search-results" id={`${groupId}-results`} aria-label="Client search results">
      {results.slice(0, limit).map((client) => <li key={client.id}>
        <label className={selected.has(client.id) ? 'client-search-result is-selected' : 'client-search-result'}>
          <input type={bulk ? 'checkbox' : 'radio'} name={groupId} checked={selected.has(client.id)} onChange={() => selectClient(client)}
            aria-label={`Select ${summaryClientName(client)} (${publicClientId(client)})`} />
          <span><strong>{summaryClientName(client)}</strong><small>{publicClientId(client)} · Txn {client.transactionNumber || 'Pending'}</small></span>
        </label>
      </li>)}
    </ul>
    {!results.length && <p className="field-hint">{clients.length ? 'No clients match your search. Your current selection is kept.' : 'No clients available.'}</p>}
    {results.length > limit && <button type="button" className="btn btn-small btn-block" onClick={() => setLimit((previous) => previous + 50)}>Show more results ({results.length - limit} remaining)</button>}
    <p className="field-hint">{bulk ? 'Only checked clients are included. Searching keeps your selections, including clients outside the results.' : 'Choose a search result to inspect or print that client.'}</p>
  </div>;
}
