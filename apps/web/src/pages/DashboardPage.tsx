import { useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState, LoadingState } from '../components/StateMessage';
import { DUE_CLIENTS_LIMIT, RECENT_PAYMENTS_LIMIT } from '../config/app';
import { useData } from '../context/DataContext';
import { formatDate, formatDateTime } from '../lib/dates';
import { formatClientName } from '../lib/loan';
import { formatPeso } from '../lib/money';
import { computeCollectorActivity, computeDashboardStats, recentPayments } from '../lib/stats';

interface StatCardProps {
  label: string;
  value: string;
  tone?: 'due' | 'pending' | 'paid';
}

function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <div className={tone ? `card stat stat-${tone}` : 'card stat'}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { rows, payments, collectors, today, loading } = useData();

  const stats = useMemo(() => computeDashboardStats(rows, payments, today), [rows, payments, today]);
  const activity = useMemo(() => computeCollectorActivity(collectors, payments, today), [collectors, payments, today]);
  const recent = useMemo(() => recentPayments(payments, RECENT_PAYMENTS_LIMIT), [payments]);
  const clientNames = useMemo(
    () => new Map(rows.map((row) => [row.client.id, formatClientName(row.client)])),
    [rows],
  );
  const dueRows = useMemo(
    () =>
      rows
        .filter((row) => row.summary.status === 'due')
        .sort((a, b) => b.summary.outstanding - a.summary.outstanding)
        .slice(0, DUE_CLIENTS_LIMIT),
    [rows],
  );

  if (loading) return <LoadingState />;

  return (
    <>
      <PageHeader title="Dashboard" description={`Live summary as of ${formatDate(today)}. Updates automatically.`} />

      <section aria-label="Summary" className="stat-grid">
        <StatCard label="Total clients" value={String(stats.totalClients)} />
        <StatCard label="Due" value={String(stats.dueCount)} tone="due" />
        <StatCard label="Pending" value={String(stats.pendingCount)} tone="pending" />
        <StatCard label="Paid" value={String(stats.paidCount)} tone="paid" />
        <StatCard label="Total principal released" value={formatPeso(stats.totalPrincipal)} />
        <StatCard label="Total outstanding balance" value={formatPeso(stats.totalOutstanding)} />
        <StatCard label="Collected today" value={formatPeso(stats.collectedToday)} />
        <StatCard label="Collected this month" value={formatPeso(stats.collectedThisMonth)} />
      </section>

      <section className="card">
        <h2>Collector activity today</h2>
        {activity.length === 0 ? (
          <EmptyState>No collectors yet. Add one in the Collectors section.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Collector</th>
                  <th className="num">Entries today</th>
                  <th className="num">Amount today</th>
                  <th>Last entry</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((item) => (
                  <tr key={item.collectorId}>
                    <td>{item.name}</td>
                    <td className="num">{item.collectionsToday}</td>
                    <td className="num">{formatPeso(item.amountToday)}</td>
                    <td>{formatDateTime(item.lastEntryAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Recent payments</h2>
        {recent.length === 0 ? (
          <EmptyState>No payments recorded yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entered</th>
                  <th>Client</th>
                  <th>Collector</th>
                  <th>Payment date</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDateTime(payment.createdAt)}</td>
                    <td>{clientNames.get(payment.clientId) ?? 'Deleted client'}</td>
                    <td>{payment.collectorName || '—'}</td>
                    <td>{formatDate(payment.paymentDate)}</td>
                    <td className="num">{formatPeso(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Clients with a due balance</h2>
        {dueRows.length === 0 ? (
          <EmptyState>No clients are due. 🎉</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Due date</th>
                  <th className="num">Outstanding</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dueRows.map(({ client, summary }) => (
                  <tr key={client.id}>
                    <td>{formatClientName(client)}</td>
                    <td>{formatDate(summary.dueDate)}</td>
                    <td className="num">{formatPeso(summary.outstanding)}</td>
                    <td>
                      <StatusBadge status={summary.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
