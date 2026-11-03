import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@web/config/firebase';
import { DEFAULT_SETTINGS } from '@web/config/settings';
import { SettingsContext } from '@web/context/SettingsContext';
import { DataContext } from '@web/context/DataContext';
import { useSubscription } from '@web/hooks/useSubscription';
import { useToday } from '@web/hooks/useToday';
import { subscribeClients } from '@web/services/clients';
import { subscribePayments } from '@web/services/payments';
import { subscribeHolidays } from '@web/services/holidays';
import { buildClientRows } from '@web/lib/loan';
import { describeError } from '@web/lib/errors';
import { normalizeClient, normalizePayment } from './loanCycle';
const clientsFeed: typeof subscribeClients = (data, error) => subscribeClients((values, metadata) => data(values.map(normalizeClient), metadata), error);
const paymentsFeed: typeof subscribePayments = (data, error) => subscribePayments((values, metadata) => data(values.map(normalizePayment), metadata), error);
export function CollectorData({ children }: { children: ReactNode }) {
  const clients = useSubscription(clientsFeed);
  const payments = useSubscription(paymentsFeed);
  const holidays = useSubscription(subscribeHolidays);
  const today = useToday();
  const [policy, setPolicy] = useState({ loading: true, error: null as string | null, enforce: false });
  useEffect(() => onSnapshot(doc(db, 'settings/Configurations/elements/paymentPolicy'), { includeMetadataChanges: true },
    snapshot => {
      if (!snapshot.metadata.fromCache) setPolicy({ loading: false, error: null, enforce: snapshot.data()?.enforceDailyMinimum === true });
    }, error => setPolicy(old => ({ ...old, loading: false, error: describeError(error) }))), []);
  const rows = useMemo(() => buildClientRows(clients.data, payments.data, new Set(holidays.data.map(h => h.date)), today), [clients.data, payments.data, holidays.data, today]);
  return <SettingsContext.Provider value={{ settings: { ...DEFAULT_SETTINGS, payments: { enforceDailyMinimum: policy.enforce } }, loading: policy.loading, error: policy.error }}>
    <DataContext.Provider value={{ clients: clients.data, payments: payments.data, holidays: holidays.data, collectors: [], rows, today,
      loading: clients.loading || payments.loading || holidays.loading, error: clients.error ?? payments.error ?? holidays.error
        ?? (clients.fresh && payments.fresh && holidays.fresh ? null : 'Displayed records are awaiting server confirmation. Connect to confirm live balances.') }}>
      {children}
    </DataContext.Provider>
  </SettingsContext.Provider>;
}
