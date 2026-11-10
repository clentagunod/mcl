import { useMemo, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, LoadingState } from '../components/StateMessage';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { formatDate, isISODate } from '../lib/dates';
import { describeError } from '../lib/errors';
import { validateHolidayForm, type FieldErrors, type HolidayFormValues } from '../lib/validation';
import { deleteHoliday, saveHoliday } from '../services/holidays';
import type { Holiday } from '../types';
import './workspace-tools.css';

const EMPTY_FORM: HolidayFormValues = { date: '', name: '' };
const monthFormatter = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('en-PH', { weekday: 'long', timeZone: 'UTC' });

function shiftMonth(month: string, difference: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + difference, 1)).toISOString().slice(0, 7);
}

export default function HolidaysPage() {
  const { holidays, loading, today } = useData();
  const { settings } = useSettings();
  const [values, setValues] = useState<HolidayFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors<HolidayFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Holiday | null>(null);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [message, setMessage] = useState('');

  const sorted = useMemo(() => [...holidays].filter(holiday => {
    const matchesDate = filter === 'all' || (filter === 'upcoming' ? holiday.date >= today : holiday.date < today);
    return matchesDate && `${holiday.name} ${holiday.date} ${formatDate(holiday.date)}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => b.date.localeCompare(a.date)), [holidays, search, filter, today]);
  const byDate = useMemo(() => new Map(holidays.map(holiday => [holiday.date, holiday])), [holidays]);
  const upcoming = useMemo(() => [...holidays].filter(holiday => holiday.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [holidays, today]);
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const chosenHoliday = byDate.get(values.date);

  function chooseDate(date: string) {
    setValues(previous => ({ ...previous, date, name: byDate.get(date)?.name ?? previous.name }));
    setErrors(previous => ({ ...previous, date: undefined }));
    setMessage('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setMessage('');

    const result = validateHolidayForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      await saveHoliday(result.value);
      setMessage(`${result.value.name} ${byDate.has(result.value.date) ? 'updated' : 'added'} for ${formatDate(result.value.date)}.`);
      setValues(EMPTY_FORM);
    } catch (caught) {
      setFormError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Holidays"
        description={`Plan non-collection days and keep loan due dates accurate. ${settings.schedule.skipSundays ? 'Sundays are excluded by your loan schedule setting.' : 'Sundays count unless registered as a holiday.'}`}
      />
      <div className="tools-summary-grid holiday-summary">
        <div className="tools-summary-item"><span className="tools-summary-icon"><Icon name="calendar" /></span><div><span className="muted small">Saved holidays</span><strong>{holidays.length}</strong></div></div>
        <div className="tools-summary-item"><span className="tools-summary-icon"><Icon name="clock" /></span><div><span className="muted small">Upcoming holidays</span><strong>{upcoming.length}</strong></div></div>
        <div className="tools-summary-item tools-summary-detail"><span className="tools-summary-icon"><Icon name="arrow-up-right" /></span><div><span className="muted small">Next non-collection day</span><strong>{upcoming[0]?.name ?? 'No upcoming holiday'}</strong><small>{upcoming[0] ? formatDate(upcoming[0].date) : 'Add a date below to plan ahead'}</small></div></div>
      </div>
      <div className="holiday-planner">
      <section className="card holiday-calendar" aria-label="Holiday calendar">
        <div className="tools-section-heading"><div><span className="workspace-eyebrow">Plan your calendar</span><h2>{monthFormatter.format(monthStart)}</h2></div><div className="holiday-month-actions"><button type="button" className="btn btn-small" aria-label="Previous month" onClick={() => setMonth(previous => shiftMonth(previous, -1))}><Icon name="chevron-left" /></button><button type="button" className="btn btn-small" aria-label="Next month" onClick={() => setMonth(previous => shiftMonth(previous, 1))}><Icon name="chevron-right" /></button></div></div>
        <div className="holiday-weekdays" aria-hidden="true">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="holiday-calendar-days" role="group" aria-label="Choose a holiday date">
          {Array.from({ length: monthStart.getUTCDay() }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const date = `${month}-${String(index + 1).padStart(2, '0')}`;
            const holiday = byDate.get(date);
            return <button key={date} type="button" className={['holiday-day', values.date === date ? 'selected' : '', holiday ? 'has-holiday' : '', date === today ? 'is-today' : ''].filter(Boolean).join(' ')} aria-label={`${formatDate(date)}${holiday ? `, ${holiday.name}` : ''}`} aria-pressed={values.date === date} title={holiday?.name ?? `Select ${formatDate(date)}`} onClick={() => chooseDate(date)} disabled={busy}>{index + 1}{holiday && <span className="holiday-day-dot" />}</button>;
          })}
        </div>
        <div className="holiday-calendar-legend"><span><i />Saved holiday</span><button type="button" className="btn btn-small" onClick={() => { setMonth(today.slice(0, 7)); chooseDate(today); }} disabled={busy}>Today</button></div>
      </section>
      <section className="card holiday-create">
        <div className="tools-section-heading"><div><span className="workspace-eyebrow">Collection schedule</span><h2>Add a holiday</h2></div><span className="tools-heading-icon"><Icon name="plus" /></span></div>
        <p className="muted small">Choose a date on the calendar or enter it below, then give the day a name.</p>
        <form onSubmit={handleSubmit} noValidate className="holiday-form">
          <FormField label="Date" error={errors.date}>
            <input
              type="date"
              value={values.date}
              onChange={(event) => { chooseDate(event.target.value); if (isISODate(event.target.value)) setMonth(event.target.value.slice(0, 7)); }}
              disabled={busy}
            />
          </FormField>
          <FormField label="Holiday name" error={errors.name}>
            <input
              type="text"
              maxLength={80}
              placeholder="e.g. Local public holiday"
              disabled={busy}
              value={values.name}
              onChange={(event) => setValues((previous) => ({ ...previous, name: event.target.value }))}
            />
          </FormField>
          <div className="holiday-date-preview"><Icon name="calendar" /><div><strong>{isISODate(values.date) ? formatDate(values.date) : 'Choose a non-collection day'}</strong><span>{isISODate(values.date) ? `${dayFormatter.format(new Date(`${values.date}T00:00:00Z`))} · ${chosenHoliday ? 'This date is already saved; its name will be updated.' : 'Excluded when calculating loan terms'}` : 'Loan due dates adjust automatically to your saved calendar.'}</span></div></div>
          <div className="inline-form-submit">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <Icon name="plus" />{busy ? 'Saving…' : 'Add holiday'}
            </button>
          </div>
        </form>
        {formError && <ErrorState message={formError} />}
        {message && <p className="alert alert-success" role="status">{message}</p>}
      </section>
      </div>

      <section className="card holiday-list">
        <div className="tools-section-heading"><div><h2>Saved holidays <span className="tools-count">{holidays.length}</span></h2><p className="muted small">Manage the dates your collectors take a break.</p></div><div className="tools-filter-pills" aria-label="Holiday date filter">{(['all', 'upcoming', 'past'] as const).map(value => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All dates' : value === 'upcoming' ? 'Upcoming' : 'Past'}</button>)}</div></div>
        <label className="tools-search"><Icon name="search" /><input type="search" aria-label="Search holidays" placeholder="Search by holiday name or date" value={search} onChange={event => setSearch(event.target.value)} /></label>
        {sorted.length === 0 ? (
          <EmptyState>{holidays.length ? 'No holidays match your search or date filter.' : settings.schedule.skipSundays ? 'No holidays yet. Sundays are skipped by your loan schedule setting.' : 'No holidays yet. Every calendar day counts until you add a holiday.'}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((holiday) => (
                  <tr key={holiday.date}>
                    <td><span className="holiday-table-date"><Icon name="calendar" />{formatDate(holiday.date)}</span></td>
                    <td><strong>{holiday.name}</strong><div className="muted small">{holiday.date >= today ? 'Upcoming non-collection day' : 'Past non-collection day'}</div></td>
                    <td className="actions-col">
                      <button type="button" className="btn btn-small btn-danger-outline" onClick={() => setToDelete(holiday)}>
                        <Icon name="trash" />Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toDelete && (
        <ConfirmDialog
          title="Delete holiday"
          message={`Remove ${toDelete.name} (${formatDate(toDelete.date)})? Due dates may move earlier if this day is no longer excluded by the loan schedule.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteHoliday(toDelete.date)}
          onClose={() => setToDelete(null)}
        />
      )}
    </>
  );
}
