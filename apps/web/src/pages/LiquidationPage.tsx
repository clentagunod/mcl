import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, LoadingState } from '../components/StateMessage';
import { Modal } from '../components/Modal';
import { ConsolidationWindowModal } from '../components/ConsolidationWindowModal';
import { useData } from '../context/DataContext';
import { applyConsolidationWindow, buildConsolidation, consolidationTotals, CONSOLIDATION_DAYS, type ConsolidationWindow } from '../lib/consolidation';
import { searchClients } from '../lib/client-search';
import { publicClientId, summaryClientName } from '../lib/printables';
import { formatDate } from '../lib/dates';
import { formatPeso } from '../lib/money';
import { Icon } from '../components/Icon';
import { LOAN_TERMS } from '../config/app';
import { useSettings } from '../context/SettingsContext';
import { useExpenses } from '../context/ExpensesContext';
import { businessExpenseTotal } from '../lib/accounting';
import type { Expense } from '../types/expenses';
import { CONSOLIDATION_METRICS, visibleConsolidationMetrics } from '../config/consolidation-metrics';
import './report-workspaces.css';

const EXPENSE_DEPENDENT = new Set(['expenseAmount', 'netIncome', 'cashSurplus']);
const NO_EXPENSES: readonly Expense[] = [];
const DAYS = Array.from({ length: CONSOLIDATION_DAYS }, (_, i) => i + 1);
const number = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 });

export default function LiquidationPage() {
  const { clients, payments, today, loading, error } = useData();
  const { settings, error: settingsError } = useSettings();
  const metrics = visibleConsolidationMetrics(settings.consolidationMetrics);
  const metricGridStyle = { '--ledger-metric-columns': Math.min(5, metrics.length) } as CSSProperties;
  const expenseState = useExpenses();
  const expenses = settings.accounting.expensesEnabled ? expenseState.expenses : NO_EXPENSES;
  const accountingUnavailable = !!settingsError || settings.accounting.expensesEnabled && (expenseState.loading || !!expenseState.error || !expenseState.fresh);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('all');
  const [requestedPage, setRequestedPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [dateWindow, setDateWindow] = useState<ConsolidationWindow | null>(null);
  const [configuringWindow, setConfiguringWindow] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const ledger = useMemo(() => buildConsolidation(clients, payments, settings.accounting.paymentAllocation, expenses), [clients, payments, settings.accounting.paymentAllocation, expenses]);
  const matchedIds = useMemo(() => new Set(searchClients(clients, search).map((client) => client.id)), [clients, search]);
  const matchedLoans = useMemo(() => ledger.filter((row) => matchedIds.has(row.client.id) && (term === 'all' || row.client.loanTermDays === Number(term))), [ledger, matchedIds, term]);
  const matched = useMemo(() => applyConsolidationWindow(matchedLoans, dateWindow), [matchedLoans, dateWindow]);
  const includeShared = !search.trim() && term === 'all';
  const sharedExpenses = businessExpenseTotal(expenses, dateWindow, includeShared);
  const totals = useMemo(() => consolidationTotals(matched, sharedExpenses), [matched, sharedExpenses]);
  const captions: Record<(typeof CONSOLIDATION_METRICS)[number][0], string> = {
    totalPayment: dateWindow ? 'Receipts collected within the selected window' : 'All current-loan receipts for the matched clients',
    principal: `${matched.length} matched current loans \u00b7 reference only`,
    payableAmount: 'Full principal plus fixed interest',
    balance: dateWindow ? 'Payable less payments in the selected window' : 'Payable less all current-loan payments',
    contractedInterest: 'Full agreed interest \u00b7 independent of collections',
    interestCollected: settings.accounting.paymentAllocation === 'principalFirst' ? 'Interest portion received after principal recovery' : 'Interest portion of payments actually received',
    expenseAmount: settings.accounting.expensesEnabled ? includeShared ? 'Paid loan expenses plus shared business costs' : 'Paid expenses assigned to matched current loans' : 'Expense tracking is disabled',
    netIncome: 'Interest collected minus recorded expenses',
    principalReleased: dateWindow ? 'Current-loan principal released within the window' : 'Full principal released for current loans',
    cashSurplus: 'Collections minus principal released and cash expenses',
  };
  const displayAmount = (key: string, value: number, currency = false) => accountingUnavailable && EXPENSE_DEPENDENT.has(key) ? 'Unavailable' : currency ? formatPeso(value) : number.format(value);
  const collectedPercent = totals.payableAmount > 0 ? totals.totalPayment / totals.payableAmount * 100 : 0;
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const inspected = matched.find((row) => row.client.id === inspectedId);
  const windowLabel = dateWindow ? `${formatDate(dateWindow.from)} – ${formatDate(dateWindow.to)}` : 'All collection dates';
  useEffect(() => setRequestedPage((previous) => Math.min(previous, pageCount)), [pageCount]);

  function scrollLedger(toTotals: boolean) {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    workspace.current?.scrollTo({ left: toTotals ? workspace.current.scrollWidth : 0,
      behavior });
    workspace.current?.scrollIntoView({ block: 'nearest', behavior });
  }

  if (loading) return <LoadingState />;
  return (
    <>
      <PageHeader title="Consolidation / Liquidation" description="Track payments, review collection days and reconcile each loan." actions={<span className="ledger-live-status" data-state={error ? 'paused' : 'live'}><span />{error ? 'Refresh paused' : 'Live collection ledger'}</span>} />
      {error && <p className="alert alert-error" role="alert">The live ledger could not refresh. Displayed information may be incomplete. {error}</p>}
      <section className="card ledger-window-bar" aria-label="Consolidation date window">
        <div><span className="ledger-window-label"><Icon name="calendar" />Calculation window</span><strong role="status">{windowLabel}</strong><p>{dateWindow ? 'Both dates included · payments outside this window are excluded' : 'All receipts for the current loan cycles'}</p></div>
        <div className="ledger-window-actions">{dateWindow && <button type="button" className="btn btn-small" onClick={() => { setDateWindow(null); setRequestedPage(1); }}>Clear dates</button>}<button type="button" className="btn btn-primary btn-small" onClick={() => setConfiguringWindow(true)}><Icon name="calendar" />Configure dates</button></div>
      </section>
      {accountingUnavailable && <p className="alert alert-warning" role="alert">Expense-adjusted totals are unavailable until settings and expense records are confirmed by the server. {settingsError || expenseState.error}</p>}
      <p className="muted small">Allocation: <strong>{settings.accounting.paymentAllocation === 'principalFirst' ? 'Principal first' : 'Proportional'}</strong>. {settings.accounting.expensesEnabled ? includeShared ? `Shared business expenses in grand totals: ${settings.consolidationMetrics.expenseAmount ? accountingUnavailable ? 'unavailable' : formatPeso(sharedExpenses) : 'included'}. Row totals include loan-specific expenses only.` : 'Filtered report: shared business expenses are excluded. Clear search and loan-term filters to include them.' : 'Expenses are disabled; no recorded expenses are deducted.'} Reports cover current loan cycles; previous loans are excluded. Shared business expenses follow paid dates and are not assigned to loan cycles.</p>
      <div className="stat-grid ledger-stat-grid" aria-label="Consolidation totals" style={metricGridStyle}>
        {metrics.map(([key, label]) => <div className="card ledger-stat" key={key}><div className="ledger-stat-top"><p className="stat-label">{label}{key === 'principal' ? ' \u00b7 reference only' : ''}</p><span className="ledger-stat-icon"><Icon name={key === 'balance' || key === 'cashSurplus' ? 'trend' : 'wallet'} /></span></div><p className="stat-value">{displayAmount(key, totals[key], true)}</p><p className="ledger-stat-caption">{captions[key]}</p></div>)}
      </div>
      <div className="ledger-collection-progress"><div><strong>{percent.format(collectedPercent)}%</strong><span>collected against payable amount</span></div><div className="ledger-progress-track" role="progressbar" aria-label="Payments collected against payable amount" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, collectedPercent))} aria-valuetext={`${collectedPercent.toFixed(1)} percent of payable amount collected`}><span style={{ width: `${Math.min(100, Math.max(0, collectedPercent))}%` }} /></div><p>Totals update with your filters and dates</p></div>
      <section className="card consolidation-card">
        <div className="ledger-section-heading"><div><h2>Collection ledger</h2><p>58 paying days, with each client’s loan endpoint highlighted.</p></div><span className="ledger-currency">PHP · Philippine peso</span></div>
        <div className="toolbar consolidation-toolbar">
          <div className="ledger-search"><Icon name="search" /><input type="search" aria-label="Search consolidation clients" placeholder="Search name, client ID or transaction" value={search} onChange={(event) => { setSearch(event.target.value); setRequestedPage(1); }} /></div>
          <select aria-label="Filter consolidation by loan term" value={term} onChange={(event) => { setTerm(event.target.value); setRequestedPage(1); }}>
            <option value="all">All loan terms</option>{LOAN_TERMS.map((days) => <option key={days} value={days}>{days} days</option>)}
          </select>
          <div className="ledger-position-controls"><button type="button" className="btn btn-small" onClick={() => scrollLedger(false)}><Icon name="chevron-left" />First columns</button>
          <button type="button" className="btn btn-small" onClick={() => scrollLedger(true)}>Jump to totals<Icon name="chevron-right" /></button></div>
        </div>
        <div className="ledger-reading-guide" id="consolidation-guide"><p><span className="term-legend" /><span><strong>Loan endpoint</strong> marks day {LOAN_TERMS.join(', ')} according to the loan term. Receipts collected on the same date share one paying day. Date windows preserve original day numbers. Select an amount to see payment history.</span></p><p><Icon name="info" /><span><strong>Balance = payable amount − total payment.</strong> Principal is shown for reference. {dateWindow ? 'Only receipts within the selected window are deducted; choose All dates for the full current-loan balance.' : `All current-loan receipts are deducted, including those after day ${CONSOLIDATION_DAYS}.`} Negative balances show payments above the payable amount. <strong>Contracted Interest = payable amount minus principal.</strong> Interest collected follows the saved allocation policy and accounts for earlier receipts when allocating a date window. Net income deducts paid expenses. Cash surplus deducts principal when its release date is included. Overpayments are not extra interest.</span></p></div>
        {matched.length === 0 ? <EmptyState>{clients.length ? 'No clients match the search and loan term.' : 'No clients available yet.'}</EmptyState> :
          <div className="consolidation-workspace" ref={workspace} role="region" aria-label="58-day consolidation ledger" aria-describedby="consolidation-guide" tabIndex={0}>
            <table className="consolidation-table" style={{ width: `calc(var(--ledger-client-width) + ${DAYS.length * 92 + 440 + metrics.length * 130}px)` }}>
              <colgroup><col className="ledger-client-col" /><col style={{ width: 105 }} /><col style={{ width: 130 }} /><col style={{ width: 120 }} /><col style={{ width: 85 }} />{DAYS.map((day) => <col key={day} style={{ width: 92 }} />)}{metrics.map(([key]) => <col key={key} style={{ width: 130 }} />)}</colgroup>
              <thead><tr><th scope="col" className="ledger-client">Client name</th><th scope="col">Transaction</th><th scope="col">Client ID</th><th scope="col">Date of release</th><th scope="col">Loan term</th>{DAYS.map((day) => <th scope="col" className="num" key={day}>Day {day}</th>)}{metrics.map(([key, label]) => <th scope="col" className="num" key={key}>{label}</th>)}</tr></thead>
              <tbody>{matched.slice(start, start + pageSize).map((row) => <tr key={row.client.id}>
                <th scope="row" className="ledger-client"><strong title={summaryClientName(row.client)}>{summaryClientName(row.client)}</strong><button type="button" className="ledger-history" onClick={() => setInspectedId(row.client.id)} aria-label={`Payment history for ${summaryClientName(row.client)}`}>{row.days.length} paying {row.days.length === 1 ? 'day' : 'days'}{row.days.some((day) => day.day > CONSOLIDATION_DAYS) ? ` · +${row.days.filter((day) => day.day > CONSOLIDATION_DAYS).length} after day 58` : ''}</button></th>
                <td>{row.client.transactionNumber || 'Pending'}</td><td>{publicClientId(row.client)}</td><td>{formatDate(row.client.approvalDate)}</td><td>{row.client.loanTermDays} days</td>
                {DAYS.map((day) => {
                  const payment = row.days.find((paymentDay) => paymentDay.day === day);
                  const endpoint = day === row.client.loanTermDays;
                  return <td key={day} className={`num${endpoint ? ' loan-endpoint' : ''}${day > row.client.loanTermDays ? ' after-term' : ''}`} title={endpoint ? `${row.client.loanTermDays}-day loan ends here` : undefined}>
                    {payment ? <button className="ledger-payment" type="button" onClick={() => setInspectedId(row.client.id)} aria-label={`Day ${day}, ${summaryClientName(row.client)}, ${formatPeso(payment.amount)}, ${formatDate(payment.date)}`} title={`${formatDate(payment.date)} · ${payment.receipts} receipt(s)`}>{number.format(payment.amount)}</button> : <span aria-label={endpoint ? `End of ${row.client.loanTermDays}-day loan; no payment` : 'No payment'}>—</span>}
                  </td>;
                })}
                {metrics.map(([key]) => <td className="num ledger-total" key={key}>{displayAmount(key, row[key])}</td>)}
              </tr>)}</tbody>
              <tfoot><tr><th scope="row" className="ledger-client">Grand total<small>All {matched.length} matched clients{settings.accounting.expensesEnabled && includeShared ? ' + shared expenses' : ''}</small></th><td colSpan={CONSOLIDATION_DAYS + 4} />{metrics.map(([key]) => <td className="num" key={key}>{displayAmount(key, totals[key])}</td>)}</tr></tfoot>
            </table>
          </div>}
        <nav className="client-pagination" aria-label="Consolidation pagination">
          <div className="pagination-summary"><span className="muted small" role="status">Showing {matched.length ? start + 1 : 0}–{Math.min(start + pageSize, matched.length)} of {matched.length} clients · totals cover all matches</span><label className="pagination-size">Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setRequestedPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label></div>
          <div className="pagination-buttons"><button type="button" className="btn btn-small" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>Previous</button><span className="small">Page {page} of {pageCount}</span><button type="button" className="btn btn-small" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)}>Next</button></div>
        </nav>
      </section>
      {configuringWindow && <ConsolidationWindowModal window={dateWindow} rows={matchedLoans} expenses={expenses} includeShared={includeShared} accountingUnavailable={accountingUnavailable} today={today} onClose={() => setConfiguringWindow(false)} onApply={(window) => { setDateWindow(window); setRequestedPage(1); setConfiguringWindow(false); }} />}
      {inspected && <Modal title={`Payment history — ${summaryClientName(inspected.client)}`} onClose={() => setInspectedId(null)} wide>
        <p className="muted small">{publicClientId(inspected.client)} · Transaction {inspected.client.transactionNumber || 'Pending'} · {inspected.client.loanTermDays}-day loan</p>
        <p className="muted small">{windowLabel}{dateWindow ? ' · both dates included; original paying-day numbers' : ''}</p>
        <div className="ledger-history-totals" style={metricGridStyle}>{metrics.map(([key, label]) => <div key={key}><span>{label}</span><strong>{displayAmount(key, inspected[key], true)}</strong></div>)}</div>
        <p className="muted small">Principal recovered: {formatPeso(inspected.principalRecovered)}. Contracted interest is the full agreed interest. Interest collected follows the saved allocation policy. Only expenses assigned to this loan are deducted here; shared costs appear in unfiltered grand totals.</p>
        {inspected.days.length ? <div className="table-wrap"><table><thead><tr><th>Day</th><th>Date collected</th><th>Receipts</th><th className="num">Amount</th></tr></thead><tbody>{inspected.days.map((day) => <tr key={day.date}><td>{day.day}</td><td>{formatDate(day.date)}</td><td>{day.receipts}</td><td className="num">{formatPeso(day.amount)}</td></tr>)}</tbody></table></div> : <EmptyState>{dateWindow ? 'No payments collected within this window.' : 'No payments recorded.'}</EmptyState>}
      </Modal>}
    </>
  );
}
