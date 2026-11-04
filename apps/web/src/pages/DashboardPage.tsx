import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CollectionTrendChart, LoanStatusChart } from '../components/DashboardCharts';
import { Icon, type IconName } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState, LoadingState } from '../components/StateMessage';
import { useSettings } from '../context/SettingsContext';
import { useData } from '../context/DataContext';
import { formatDate, formatDateTime } from '../lib/dates';
import { formatClientName } from '../lib/loan';
import { formatPeso } from '../lib/money';
import { computeCollectorActivity, computeDashboardStats, recentPayments } from '../lib/stats';
import './dashboard.css';

function FinancialStat({ label, value, hint, detail, icon, emphasis = false }: {
  label: string; value: number; hint: string; detail: string; icon: IconName; emphasis?: boolean;
}) {
  const descriptionId = useId();
  return <div className={emphasis ? 'card dashboard-kpi dashboard-kpi-emphasis' : 'card dashboard-kpi'}>
    <div className="dashboard-kpi-heading"><p className="stat-label">{label}<button type="button" className="dashboard-info-button" aria-label={`About ${label.toLowerCase()}`} aria-describedby={descriptionId} data-tooltip={detail}><Icon name="info" /></button><span id={descriptionId} className="sr-only">{detail}</span></p><span><Icon name={icon} /></span></div>
    <p className="stat-value">{formatPeso(value)}</p><p className="dashboard-kpi-hint">{hint}</p>
  </div>;
}

export default function DashboardPage() {
  const { rows, payments, collectors, today, loading, error } = useData();
  const { settings: { general } } = useSettings();
  const stats = useMemo(() => computeDashboardStats(rows, payments, today), [rows, payments, today]);
  const activity = useMemo(() => computeCollectorActivity(collectors, payments, today), [collectors, payments, today]);
  const recent = useMemo(() => recentPayments(payments, general.recentPaymentsLimit), [payments, general.recentPaymentsLimit]);
  const clientNames = useMemo(() => new Map(rows.map(row => [row.client.id, formatClientName(row.client)])), [rows]);
  const dueRows = useMemo(() => rows.filter(row => row.summary.status === 'due')
    .sort((a, b) => b.summary.outstanding - a.summary.outstanding).slice(0, general.dueClientsLimit), [rows, general.dueClientsLimit]);

  if (loading) return <LoadingState />;

  return <div className="dashboard-page">
    <PageHeader title="Dashboard" description="A clear view of your lending activity and collections." actions={<Link className="btn btn-primary" to="/clients"><Icon name="clients" />View clients</Link>} />
    <div className="dashboard-date-line"><span className={error ? 'dashboard-live-indicator paused' : 'dashboard-live-indicator'} /><span>{error ? 'Awaiting live confirmation' : 'Live workspace overview'}</span><span className="dashboard-date-separator" /><time dateTime={today}>{formatDate(today)}</time></div>

    <section aria-label="Summary" className="dashboard-kpi-grid">
      <FinancialStat label="Collected today" value={stats.collectedToday} hint="Receipts with today's payment date" detail="Total recorded receipts whose payment date is today, including receipts entered later for that date." icon="wallet" emphasis />
      <FinancialStat label="Collected this month" value={stats.collectedThisMonth} hint="Based on recorded payment dates" detail="Total recorded receipts with a payment date in the current calendar month. Entry timestamps do not change this total." icon="trend" />
      <FinancialStat label="Total outstanding balance" value={stats.totalOutstanding} hint="Remaining principal and fixed interest" detail="Unpaid principal and fixed interest for current client loans, after their current-loan payments. Clients in Trash are excluded." icon="clock" />
      <FinancialStat label="Total principal released" value={stats.totalPrincipal} hint="Principal across current client loans" detail="Sum of the principal amounts on current client records. This is not a lifetime total of earlier renewed loans." icon="clients" />
    </section>

    <div className="dashboard-chart-grid"><CollectionTrendChart payments={payments} today={today} /><LoanStatusChart stats={stats} /></div>

    <div className="dashboard-records-grid">
      <section className="card dashboard-recent-card">
        <div className="dashboard-card-heading"><div><h2>Recent payments</h2><p>Latest {general.recentPaymentsLimit} recorded entries</p></div><span className="dashboard-section-icon"><Icon name="wallet" /></span></div>
        {recent.length === 0 ? <EmptyState>No payments recorded yet.</EmptyState> : <div className="table-wrap dashboard-table-scroll"><table>
          <thead><tr><th>Client / collector</th><th>Payment date</th><th>Entered</th><th className="num">Amount</th></tr></thead>
          <tbody>{recent.map(payment => <tr key={payment.id}>
            <td><span className="dashboard-table-primary">{clientNames.get(payment.clientId) ?? 'Deleted client'}</span><span className="dashboard-table-secondary">{payment.collectorName || '—'}</span></td>
            <td>{formatDate(payment.paymentDate)}</td><td className="dashboard-entry-time">{formatDateTime(payment.createdAt)}</td><td className="num dashboard-amount">{formatPeso(payment.amount)}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>

      <section className="card dashboard-due-card">
        <div className="dashboard-card-heading"><div><h2>Clients with a due balance</h2><p>Highest outstanding balances first</p></div><span className="dashboard-due-count">{stats.dueCount} due</span></div>
        {dueRows.length === 0 ? <EmptyState>No clients are due.</EmptyState> : <div className="table-wrap dashboard-table-scroll"><table>
          <thead><tr><th>Client / due date</th><th className="num">Outstanding</th><th>Status</th></tr></thead>
          <tbody>{dueRows.map(({ client, summary }) => <tr key={client.id}>
            <td><span className="dashboard-table-primary">{formatClientName(client)}</span><span className="dashboard-table-secondary">Due {formatDate(summary.dueDate)}</span></td>
            <td className="num dashboard-amount">{formatPeso(summary.outstanding)}</td><td><StatusBadge status={summary.status} /></td>
          </tr>)}</tbody>
        </table></div>}
        {stats.dueCount > dueRows.length && <p className="dashboard-table-note">Showing {dueRows.length} of {stats.dueCount} due clients. <Link to="/clients">View the client list</Link></p>}
      </section>
    </div>

    <section className="card dashboard-collector-card">
      <div className="dashboard-card-heading"><div><h2>Collector activity today</h2><p>Entries and collections for {formatDate(today)}</p></div><Link className="dashboard-text-link" to="/collectors">Manage accounts<Icon name="arrow-up-right" /></Link></div>
      {activity.length === 0 ? <EmptyState>No collectors yet. Add one in the Collectors section.</EmptyState> : <div className="table-wrap dashboard-table-scroll"><table>
        <thead><tr><th>Collector</th><th className="num">Entries today</th><th className="num">Amount today</th><th>Last entry</th></tr></thead>
        <tbody>{activity.map(item => <tr key={item.collectorId}>
          <td><span className="dashboard-collector-name"><span className="dashboard-avatar" aria-hidden="true">{item.name.trim().charAt(0).toUpperCase() || '?'}</span><strong>{item.name}</strong></span></td>
          <td className="num">{item.collectionsToday}</td><td className="num dashboard-amount">{formatPeso(item.amountToday)}</td><td>{formatDateTime(item.lastEntryAt)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
