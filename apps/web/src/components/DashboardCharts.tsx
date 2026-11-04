import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Payment } from '../types';
import { buildCollectionTrend, type CollectionTrendDays } from '../lib/collection-trend';
import { formatDate } from '../lib/dates';
import { formatPeso, sumAmounts } from '../lib/money';
import type { DashboardStats } from '../lib/stats';
import { Icon } from './Icon';

const compactPeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 });
const shortDate = (date: string) => formatDate(date).replace(/, \d{4}$/, '');

export function CollectionTrendChart({ payments, today }: { payments: readonly Payment[]; today: string }) {
  const [days, setDays] = useState<CollectionTrendDays>(14);
  const [selectedDate, setSelectedDate] = useState(today);
  const titleId = useId();
  const detailId = useId();
  const plot = useRef<HTMLDivElement>(null);
  const series = useMemo(() => buildCollectionTrend(payments, today, days), [payments, today, days]);
  const selected = series.find(point => point.date === selectedDate) ?? series[series.length - 1];
  const total = sumAmounts(series.map(point => point.amount));
  const receipts = series.reduce((count, point) => count + point.receipts, 0);
  const max = Math.max(100, ...series.map(point => point.amount));

  function selectDay(index: number) {
    const point = series[index];
    setSelectedDate(point.date);
    plot.current?.querySelector<HTMLButtonElement>(`[data-date="${point.date}"]`)?.focus();
  }

  return <section className="card dashboard-trend" aria-labelledby={titleId}>
    <div className="dashboard-card-heading"><div><h2 id={titleId}>Collection trend</h2><p>Collected amounts by payment date</p></div>
      <div className="trend-range" role="group" aria-label="Collection trend range">{([7, 14, 30] as const).map(range => <button type="button" key={range} aria-label={`Show last ${range} days`} aria-pressed={days === range} onClick={() => setDays(range)}>{range}D</button>)}</div>
    </div>
    <div className="trend-summary"><div><strong>{formatPeso(total)}</strong><span>{receipts} {receipts === 1 ? 'receipt' : 'receipts'} over {days} days</span></div><div className="trend-day-detail" id={detailId}><span>{shortDate(selected.date)}{selected.date === today ? ' · Today' : ''}</span><strong>{formatPeso(selected.amount)}</strong></div></div>
    <div className="collection-chart" role="group" aria-label="Daily collections. Use left and right arrow keys to inspect dates.">
      <div className="chart-y-axis" aria-hidden="true"><span>{compactPeso.format(max)}</span><span>{compactPeso.format(max / 2)}</span><span>₱0</span></div>
      <div className="chart-plot" ref={plot}>
        <div className="chart-columns">{series.map((point, index) => <button key={point.date} type="button" data-date={point.date} className={point.date === selected.date ? 'chart-column selected' : 'chart-column'} style={{ '--bar-height': `${point.amount / max * 100}%` } as CSSProperties} tabIndex={point.date === selected.date ? 0 : -1} aria-pressed={point.date === selected.date} aria-describedby={detailId} aria-label={`${formatDate(point.date)}: ${formatPeso(point.amount)}, ${point.receipts} ${point.receipts === 1 ? 'receipt' : 'receipts'}`} title={`${formatDate(point.date)} · ${formatPeso(point.amount)} · ${point.receipts} ${point.receipts === 1 ? 'receipt' : 'receipts'}`} onFocus={() => setSelectedDate(point.date)} onMouseEnter={() => setSelectedDate(point.date)} onClick={() => setSelectedDate(point.date)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? Math.min(series.length - 1, index + 1) : event.key === 'ArrowLeft' ? Math.max(0, index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? series.length - 1 : null;
          if (next !== null) { event.preventDefault(); selectDay(next); }
        }}><span className="chart-bar" /><span className="chart-day-marker" /></button>)}</div>
        {receipts === 0 && <p className="chart-no-receipts">No collections in this period</p>}
      </div>
    </div>
    <div className="chart-x-axis" aria-hidden="true"><span>{shortDate(series[0].date)}</span><span>{shortDate(series[Math.floor(series.length / 2)].date)}</span><span>{shortDate(series[series.length - 1].date)}</span></div>
    <p className="chart-help"><Icon name="info" />Hover over a day, or focus the chart and use the arrow keys, to inspect collections.</p>
  </section>;
}

export function LoanStatusChart({ stats }: { stats: DashboardStats }) {
  const titleId = useId();
  const segments = [
    { label: 'Due', count: stats.dueCount, tone: 'due' },
    { label: 'Pending', count: stats.pendingCount, tone: 'pending' },
    { label: 'Paid', count: stats.paidCount, tone: 'paid' },
  ] as const;
  const circumference = 2 * Math.PI * 58;
  let offset = 0;

  return <section className="card dashboard-loan-status" aria-labelledby={titleId}>
    <div className="dashboard-card-heading"><div><h2 id={titleId}>Loan status</h2><p>Current loans across all clients</p></div><Link className="dashboard-text-link" to="/clients" aria-label="View all clients"><Icon name="arrow-up-right" /></Link></div>
    <div className="loan-status-content"><svg className="loan-status-donut" viewBox="0 0 152 152" role="img" aria-label={`${stats.totalClients} total clients: ${stats.dueCount} due, ${stats.pendingCount} pending, ${stats.paidCount} paid.`}>
      <circle cx="76" cy="76" r="58" fill="none" stroke="var(--surface-alt)" strokeWidth="14" />
      {segments.map(segment => {
        const length = stats.totalClients ? segment.count / stats.totalClients * circumference : 0;
        const currentOffset = offset;
        offset += length;
        return <circle key={segment.tone} cx="76" cy="76" r="58" fill="none" className={`donut-segment donut-${segment.tone}`} strokeWidth="14" strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-currentOffset} transform="rotate(-90 76 76)" />;
      })}
      <text x="76" y="76" className="donut-total" textAnchor="middle">{stats.totalClients}</text><text x="76" y="94" className="donut-caption" textAnchor="middle">Total clients</text>
    </svg>
    <dl className="loan-status-legend">{segments.map(segment => <div key={segment.tone}><dt><span className={`loan-status-dot status-${segment.tone}`} />{segment.label}</dt><dd><strong>{segment.count}</strong><span>{stats.totalClients ? Math.round(segment.count / stats.totalClients * 100) : 0}%</span></dd></div>)}</dl></div>
    <div className="loan-status-note"><Icon name={stats.dueCount ? 'clock' : 'check'} /><p>{stats.totalClients === 0 ? 'Add your first client to start tracking loan status.' : stats.dueCount ? `${stats.dueCount} ${stats.dueCount === 1 ? 'client has' : 'clients have'} a balance at or past the loan due date.` : 'No clients have a balance at or past the loan due date.'}</p></div>
  </section>;
}
