import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, LoadingState } from '../components/StateMessage';
import { Modal } from '../components/Modal';
import { useData } from '../context/DataContext';
import { buildConsolidation, consolidationTotals, CONSOLIDATION_DAYS } from '../lib/consolidation';
import { searchClients } from '../lib/client-search';
import { publicClientId, summaryClientName } from '../lib/printables';
import { formatDate } from '../lib/dates';
import { formatPeso } from '../lib/money';

const DAYS = Array.from({ length: CONSOLIDATION_DAYS }, (_, i) => i + 1);
const number = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LiquidationPage() {
  const { clients, payments, loading, error } = useData();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('all');
  const [requestedPage, setRequestedPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const ledger = useMemo(() => buildConsolidation(clients, payments), [clients, payments]);
  const matchedIds = useMemo(() => new Set(searchClients(clients, search).map((client) => client.id)), [clients, search]);
  const matched = useMemo(() => ledger.filter((row) => matchedIds.has(row.client.id) && (term === 'all' || row.client.loanTermDays === Number(term))), [ledger, matchedIds, term]);
  const totals = useMemo(() => consolidationTotals(matched), [matched]);
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const inspected = ledger.find((row) => row.client.id === inspectedId);
  useEffect(() => setRequestedPage((previous) => Math.min(previous, pageCount)), [pageCount]);

  if (loading) return <LoadingState />;
  return (
    <>
      <PageHeader title="Consolidation / Liquidation" description="Live collection ledger from web and collector payments. Amounts are in PHP." />
      {error && <p className="alert alert-error" role="alert">The live ledger could not refresh. Displayed information may be incomplete. {error}</p>}
      <div className="stat-grid" aria-label="Consolidation totals">
        <div className="card"><p className="stat-label">Total payment</p><p className="stat-value">{formatPeso(totals.totalPayment)}</p></div>
        <div className="card"><p className="stat-label">Principal</p><p className="stat-value">{formatPeso(totals.principal)}</p></div>
        <div className="card"><p className="stat-label">Balance · principal − payments</p><p className="stat-value">{formatPeso(totals.balance)}</p></div>
      </div>
      <section className="card consolidation-card">
        <div className="toolbar consolidation-toolbar">
          <input type="search" aria-label="Search consolidation clients" placeholder="Search name, client ID or transaction" value={search} onChange={(event) => { setSearch(event.target.value); setRequestedPage(1); }} />
          <select aria-label="Filter consolidation by loan term" value={term} onChange={(event) => { setTerm(event.target.value); setRequestedPage(1); }}>
            <option value="all">All loan terms</option>{[45, 50, 58].map((days) => <option key={days} value={days}>{days} days</option>)}
          </select>
          <button type="button" className="btn btn-small" onClick={() => workspace.current?.scrollTo({ left: 0, behavior: 'smooth' })}>First columns</button>
          <button type="button" className="btn btn-small" onClick={() => workspace.current?.scrollTo({ left: workspace.current.scrollWidth, behavior: 'smooth' })}>Jump to totals</button>
        </div>
        <p className="field-hint" id="consolidation-guide"><span className="term-legend" /> Highlighted cell = the client’s loan endpoint (45, 50 or 58). One numbered day per payment date; same-date receipts are combined. Click a day to inspect the full history.</p>
        <p className="field-hint">This sheet’s balance is principal minus all payments for the current loan, including payments after day 58. Negative values show excess over principal. The dashboard’s outstanding balance also includes fixed interest. Earlier loan ledgers remain in each client’s Renewal history.</p>
        {matched.length === 0 ? <EmptyState>{clients.length ? 'No clients match the search and loan term.' : 'No clients available yet.'}</EmptyState> :
          <div className="consolidation-workspace" ref={workspace} role="region" aria-label="58-day consolidation ledger" aria-describedby="consolidation-guide" tabIndex={0}>
            <table className="consolidation-table">
              <colgroup><col className="ledger-client-col" /><col style={{ width: 105 }} /><col style={{ width: 130 }} /><col style={{ width: 120 }} /><col style={{ width: 85 }} />{DAYS.map((day) => <col key={day} style={{ width: 92 }} />)}{[1, 2, 3].map((i) => <col key={`total-${i}`} style={{ width: 130 }} />)}</colgroup>
              <thead><tr><th scope="col" className="ledger-client">Client name</th><th scope="col">Transaction</th><th scope="col">Client ID</th><th scope="col">Date of release</th><th scope="col">Loan term</th>{DAYS.map((day) => <th scope="col" className="num" key={day}>Day {day}</th>)}<th scope="col" className="num">Total payment</th><th scope="col" className="num">Principal</th><th scope="col" className="num">Balance</th></tr></thead>
              <tbody>{matched.slice(start, start + pageSize).map((row) => <tr key={row.client.id}>
                <th scope="row" className="ledger-client"><strong title={summaryClientName(row.client)}>{summaryClientName(row.client)}</strong><button type="button" className="ledger-history" onClick={() => setInspectedId(row.client.id)} aria-label={`Payment history for ${summaryClientName(row.client)}`}>{row.days.length} paying {row.days.length === 1 ? 'day' : 'days'}{row.days.length > 58 ? ` · +${row.days.length - 58} after day 58` : ''}</button></th>
                <td>{row.client.transactionNumber || 'Pending'}</td><td>{publicClientId(row.client)}</td><td>{formatDate(row.client.approvalDate)}</td><td>{row.client.loanTermDays} days</td>
                {DAYS.map((day) => {
                  const payment = row.days[day - 1];
                  const endpoint = day === row.client.loanTermDays;
                  return <td key={day} className={`num${endpoint ? ' loan-endpoint' : ''}${day > row.client.loanTermDays ? ' after-term' : ''}`} title={endpoint ? `${row.client.loanTermDays}-day loan ends here` : undefined}>
                    {payment ? <button className="ledger-payment" type="button" onClick={() => setInspectedId(row.client.id)} aria-label={`Day ${day}, ${summaryClientName(row.client)}, ${formatPeso(payment.amount)}, ${formatDate(payment.date)}`} title={`${formatDate(payment.date)} · ${payment.receipts} receipt(s)`}>{number.format(payment.amount)}</button> : <span aria-label={endpoint ? `End of ${row.client.loanTermDays}-day loan; no payment` : 'No payment'}>—</span>}
                  </td>;
                })}
                <td className="num ledger-total">{number.format(row.totalPayment)}</td><td className="num ledger-total">{number.format(row.principal)}</td><td className="num ledger-total">{number.format(row.balance)}</td>
              </tr>)}</tbody>
              <tfoot><tr><th scope="row" className="ledger-client">Grand total<small>All {matched.length} matched clients</small></th><td colSpan={62} /><td className="num">{number.format(totals.totalPayment)}</td><td className="num">{number.format(totals.principal)}</td><td className="num">{number.format(totals.balance)}</td></tr></tfoot>
            </table>
          </div>}
        <nav className="client-pagination" aria-label="Consolidation pagination">
          <div className="pagination-summary"><span className="muted small" role="status">Showing {matched.length ? start + 1 : 0}–{Math.min(start + pageSize, matched.length)} of {matched.length} clients · totals cover all matches</span><label className="pagination-size">Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setRequestedPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label></div>
          <div className="pagination-buttons"><button type="button" className="btn btn-small" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>Previous</button><span className="small">Page {page} of {pageCount}</span><button type="button" className="btn btn-small" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)}>Next</button></div>
        </nav>
      </section>
      {inspected && <Modal title={`Payment history — ${summaryClientName(inspected.client)}`} onClose={() => setInspectedId(null)} wide>
        <p className="muted small">{publicClientId(inspected.client)} · Transaction {inspected.client.transactionNumber || 'Pending'} · {inspected.client.loanTermDays}-day loan</p>
        <p>Total payment: <strong>{formatPeso(inspected.totalPayment)}</strong> · Principal: <strong>{formatPeso(inspected.principal)}</strong> · Balance: <strong>{formatPeso(inspected.balance)}</strong></p>
        {inspected.days.length ? <div className="table-wrap"><table><thead><tr><th>Day</th><th>Date collected</th><th>Receipts</th><th className="num">Amount</th></tr></thead><tbody>{inspected.days.map((day) => <tr key={day.date}><td>{day.day}</td><td>{formatDate(day.date)}</td><td>{day.receipts}</td><td className="num">{formatPeso(day.amount)}</td></tr>)}</tbody></table></div> : <EmptyState>No payments recorded.</EmptyState>}
      </Modal>}
    </>
  );
}
