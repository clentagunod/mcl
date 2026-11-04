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
import { Icon } from '../components/Icon';
import './report-workspaces.css';

const DAYS = Array.from({ length: CONSOLIDATION_DAYS }, (_, i) => i + 1);
const number = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 });

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
  const collectedPercent = totals.principal > 0 ? totals.totalPayment / totals.principal * 100 : 0;
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const inspected = ledger.find((row) => row.client.id === inspectedId);
  useEffect(() => setRequestedPage((previous) => Math.min(previous, pageCount)), [pageCount]);

  function scrollLedger(toTotals: boolean) {
    workspace.current?.scrollTo({ left: toTotals ? workspace.current.scrollWidth : 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  if (loading) return <LoadingState />;
  return (
    <>
      <PageHeader title="Consolidation / Liquidation" description="Track payments, review collection days and reconcile each loan." actions={<span className="ledger-live-status" data-state={error ? 'paused' : 'live'}><span />{error ? 'Refresh paused' : 'Live collection ledger'}</span>} />
      {error && <p className="alert alert-error" role="alert">The live ledger could not refresh. Displayed information may be incomplete. {error}</p>}
      <div className="stat-grid ledger-stat-grid" aria-label="Consolidation totals">
        <div className="card ledger-stat"><div className="ledger-stat-top"><p className="stat-label">Total payment</p><span className="ledger-stat-icon"><Icon name="wallet" /></span></div><p className="stat-value">{formatPeso(totals.totalPayment)}</p><p className="ledger-stat-caption">All receipts for the matched clients</p></div>
        <div className="card ledger-stat"><div className="ledger-stat-top"><p className="stat-label">Principal</p><span className="ledger-stat-icon"><Icon name="clients" /></span></div><p className="stat-value">{formatPeso(totals.principal)}</p><p className="ledger-stat-caption">{matched.length} {matched.length === 1 ? 'client' : 'clients'} in the current view</p></div>
        <div className="card ledger-stat"><div className="ledger-stat-top"><p className="stat-label">Balance · principal − payments</p><span className="ledger-stat-icon"><Icon name="trend" /></span></div><p className="stat-value">{formatPeso(totals.balance)}</p><p className="ledger-stat-caption">Principal balance, excluding fixed interest</p></div>
      </div>
      <div className="ledger-collection-progress"><div><strong>{percent.format(collectedPercent)}%</strong><span>collected against principal</span></div><div className="ledger-progress-track" role="progressbar" aria-label="Payments collected against principal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, collectedPercent))} aria-valuetext={`${collectedPercent.toFixed(1)} percent of principal collected`}><span style={{ width: `${Math.min(100, Math.max(0, collectedPercent))}%` }} /></div><p>Totals update with your filters</p></div>
      <section className="card consolidation-card">
        <div className="ledger-section-heading"><div><h2>Collection ledger</h2><p>58 paying days, with each client’s loan endpoint highlighted.</p></div><span className="ledger-currency">PHP · Philippine peso</span></div>
        <div className="toolbar consolidation-toolbar">
          <div className="ledger-search"><Icon name="search" /><input type="search" aria-label="Search consolidation clients" placeholder="Search name, client ID or transaction" value={search} onChange={(event) => { setSearch(event.target.value); setRequestedPage(1); }} /></div>
          <select aria-label="Filter consolidation by loan term" value={term} onChange={(event) => { setTerm(event.target.value); setRequestedPage(1); }}>
            <option value="all">All loan terms</option>{[45, 50, 58].map((days) => <option key={days} value={days}>{days} days</option>)}
          </select>
          <div className="ledger-position-controls"><button type="button" className="btn btn-small" onClick={() => scrollLedger(false)}><Icon name="chevron-left" />First columns</button>
          <button type="button" className="btn btn-small" onClick={() => scrollLedger(true)}>Jump to totals<Icon name="chevron-right" /></button></div>
        </div>
        <div className="ledger-reading-guide" id="consolidation-guide"><p><span className="term-legend" /><span><strong>Loan endpoint</strong> marks day 45, 50 or 58. Receipts collected on the same date share one paying day. Select an amount to see payment history.</span></p><p><Icon name="info" /><span><strong>Principal balance</strong> subtracts all current-loan payments, including those after day 58. Negative balances show excess over principal. Fixed interest is included in the dashboard’s outstanding balance.</span></p></div>
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
        <div className="ledger-history-totals"><div><span>Total payment</span><strong>{formatPeso(inspected.totalPayment)}</strong></div><div><span>Principal</span><strong>{formatPeso(inspected.principal)}</strong></div><div><span>Balance</span><strong>{formatPeso(inspected.balance)}</strong></div></div>
        {inspected.days.length ? <div className="table-wrap"><table><thead><tr><th>Day</th><th>Date collected</th><th>Receipts</th><th className="num">Amount</th></tr></thead><tbody>{inspected.days.map((day) => <tr key={day.date}><td>{day.day}</td><td>{formatDate(day.date)}</td><td>{day.receipts}</td><td className="num">{formatPeso(day.amount)}</td></tr>)}</tbody></table></div> : <EmptyState>No payments recorded.</EmptyState>}
      </Modal>}
    </>
  );
}
