import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSubscription } from '../hooks/useSubscription';
import { useToday } from '../hooks/useToday';
import { buildClientRows } from '../lib/loan';
import { completeClientRecords, subscribeClients } from '../services/clients';
import { subscribeCollectors } from '../services/collectors';
import { subscribeHolidays } from '../services/holidays';
import { subscribePayments } from '../services/payments';
import { DataContext, type DataContextValue } from './DataContext';
import { useSettings } from './SettingsContext';
import { describeError } from '../lib/errors';

/**
 * Opens the live Firestore feeds ONCE for the whole signed-in session and shares them with
 * every page. Opening them per page would pay for the same reads again on each navigation.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const clients = useSubscription(subscribeClients);
  const payments = useSubscription(subscribePayments);
  const collectors = useSubscription(subscribeCollectors);
  const holidays = useSubscription(subscribeHolidays);
  const today = useToday();
  const settingsState = useSettings();
  const completed = useRef(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  useEffect(() => {
    if (!clients.fresh || clients.loading || clients.error || settingsState.loading || settingsState.error || completed.current) return;
    completed.current = true;
    void completeClientRecords(clients.data).catch((error) => setCompletionError(`Client record update: ${describeError(error)} Retry in Settings.`));
  }, [clients, settingsState]);

  useEffect(() => {
    if (clients.data.every((client) => client.clientNumber && client.transactionNumber && client.dailyAmount)) setCompletionError(null);
  }, [clients.data]);

  const holidayDates = useMemo(() => new Set(holidays.data.map((holiday) => holiday.date)), [holidays.data]);
  // Recycled clients retain their ledger for restoration, but leave active reports.
  const activePayments = useMemo(() => {
    const ids = new Set(clients.data.map(client => client.id));
    return payments.data.filter(payment => ids.has(payment.clientId));
  }, [clients.data, payments.data]);

  const rows = useMemo(
    () => buildClientRows(clients.data, payments.data, holidayDates, today),
    [clients.data, payments.data, holidayDates, today],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      clients: clients.data,
      payments: activePayments,
      collectors: collectors.data,
      holidays: holidays.data,
      rows,
      today,
      loading: clients.loading || payments.loading || collectors.loading || holidays.loading,
      error: clients.error ?? payments.error ?? collectors.error ?? holidays.error ?? completionError
        ?? (clients.fresh && payments.fresh && collectors.fresh && holidays.fresh ? null : 'Displayed records are awaiting server confirmation. Payment entry and renewals require confirmed live data.'),
    }),
    [clients, payments, activePayments, collectors, holidays, rows, today, completionError],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
