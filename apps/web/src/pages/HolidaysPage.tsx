import { useMemo, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/StateMessage';
import { useData } from '../context/DataContext';
import { formatDate } from '../lib/dates';
import { describeError } from '../lib/errors';
import { validateHolidayForm, type FieldErrors, type HolidayFormValues } from '../lib/validation';
import { deleteHoliday, saveHoliday } from '../services/holidays';
import type { Holiday } from '../types';

const EMPTY_FORM: HolidayFormValues = { date: '', name: '' };

export default function HolidaysPage() {
  const { holidays, loading } = useData();
  const [values, setValues] = useState<HolidayFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors<HolidayFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Holiday | null>(null);

  const sorted = useMemo(() => [...holidays].sort((a, b) => b.date.localeCompare(a.date)), [holidays]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = validateHolidayForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      await saveHoliday(result.value);
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
        description="Holidays and other non-collection days. Like Sundays, they do not count toward a loan's term."
      />

      <section className="card">
        <h2>Add a holiday</h2>
        <form onSubmit={handleSubmit} noValidate className="inline-form">
          <FormField label="Date" error={errors.date}>
            <input
              type="date"
              value={values.date}
              onChange={(event) => setValues((previous) => ({ ...previous, date: event.target.value }))}
            />
          </FormField>
          <FormField label="Holiday name" error={errors.name}>
            <input
              type="text"
              maxLength={80}
              value={values.name}
              onChange={(event) => setValues((previous) => ({ ...previous, name: event.target.value }))}
            />
          </FormField>
          <div className="inline-form-submit">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Add holiday'}
            </button>
          </div>
        </form>
        {formError && <ErrorState message={formError} />}
      </section>

      <section className="card">
        <h2>Saved holidays</h2>
        {sorted.length === 0 ? (
          <EmptyState>No holidays yet. Only Sundays are skipped until you add some.</EmptyState>
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
                    <td>{formatDate(holiday.date)}</td>
                    <td>{holiday.name}</td>
                    <td className="actions-col">
                      <button type="button" className="btn btn-small btn-danger-outline" onClick={() => setToDelete(holiday)}>
                        Delete
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
          message={`Remove ${toDelete.name} (${formatDate(toDelete.date)})? That day will count toward loan terms again, so due dates may move earlier.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteHoliday(toDelete.date)}
          onClose={() => setToDelete(null)}
        />
      )}
    </>
  );
}
