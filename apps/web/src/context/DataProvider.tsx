import { useMemo, type ReactNode } from 'react';
import { useSubscription } from '../hooks/useSubscription';
import { useToday } from '../hooks/useToday';
import { buildClientRows } from '../lib/loan';
import { subscribeClients } from '../services/clients';
import { subscribeCollectors } from '../services/collectors';
import { subscribeHolidays } from '../services/holidays';
import { subscribePayments } from '../services/payments';
import { DataContext, type DataContextValue } from './DataContext';

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

  const holidayDates = useMemo(() => new Set(holidays.data.map((holiday) => holiday.date)), [holidays.data]);

  const rows = useMemo(
    () => buildClientRows(clients.data, payments.data, holidayDates, today),
    [clients.data, payments.data, holidayDates, today],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      clients: clients.data,
      payments: payments.data,
      collectors: collectors.data,
      holidays: holidays.data,
      rows,
      today,
      loading: clients.loading || payments.loading || collectors.loading || holidays.loading,
      error: clients.error ?? payments.error ?? collectors.error ?? holidays.error,
    }),
    [clients, payments, collectors, holidays, rows, today],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
