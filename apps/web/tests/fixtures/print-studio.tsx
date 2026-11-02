import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '../../src/config/settings';
import { DataContext } from '../../src/context/DataContext';
import { SettingsContext } from '../../src/context/SettingsContext';
import PrintablesPage from '../../src/pages/PrintablesPage';
import type { Client, Payment } from '../../src/types';
import '../../src/index.css';
import SettingsPage from '../../src/pages/SettingsPage';
import { AuthContext } from '../../src/context/AuthContext';
import ClientsPage from '../../src/pages/clients/ClientsPage';
import { buildClientRows } from '../../src/lib/loan';
import { useEffect, useState } from 'react';
import LiquidationPage from '../../src/pages/LiquidationPage';
import { addDays } from '../../src/lib/dates';

// Local synthetic data only. This fixture never opens a Firebase subscription.
const count = new URLSearchParams(location.search).get('many') ? 65 : 3;
const clients: Client[] = Array.from({ length: count }, (_, i) => ({
  id: `mcl${String(i + 1).padStart(4, '0')}`, clientNumber: `mcl${String(i + 1).padStart(4, '0')}`,
  transactionNumber: String(i + 1).padStart(5, '0'), firstName: 'Juan', middleName: 'Santos',
  lastName: ['Dela Cruz', 'Reyes', 'Santos'][i % 3] + (i > 2 ? ` ${i}` : ''), address: 'Purok 1, San Miguel, Tagum City',
  cellphone: '09170000000', principal: 10000, interest: 1250, dailyAmount: 250,
  loanTermDays: [45, 50, 58][i % 3] as 45 | 50 | 58, approvalDate: '2026-10-20',
}));
const payments: Payment[] = [
  { id: 'p1', clientId: clients[0].id, amount: 125, paymentDate: '2026-10-21', collectorId: 'collector1', collectorName: 'Collector One', createdAt: new Date('2026-10-21T08:00:00Z') },
  { id: 'p2', clientId: clients[0].id, amount: 125, paymentDate: '2026-10-21', collectorId: 'collector1', collectorName: 'Collector One', createdAt: new Date('2026-10-21T09:00:00Z') },
  { id: 'p3', clientId: clients[0].id, amount: 500, paymentDate: '2026-11-02', collectorId: 'admin1', collectorName: 'Admin One', notes: 'Two installments', createdAt: new Date('2026-11-02T08:00:00Z') },
  { id: 'p4', clientId: clients[1].id, amount: 250, paymentDate: '2026-11-02', collectorId: 'collector1', collectorName: 'Collector One', createdAt: new Date('2026-11-02T08:00:00Z') },
];
if (new URLSearchParams(location.search).has('latepayments')) {
  clients[2].approvalDate = '2026-07-31';
  for (let i = 0; i < 60; i += 1) payments.push({ id: `late-${i}`, clientId: clients[2].id, amount: 100, paymentDate: addDays('2026-08-01', i), collectorId: 'collector1', collectorName: 'Collector One', createdAt: null });
}
if (new URLSearchParams(location.search).has('longaddress')) clients[0].address = 'Purok 1, San Miguel, Tagum City. '.repeat(80) + 'X'.repeat(2000);
const isSettings = new URLSearchParams(location.search).get('view') === 'settings';
const isClients = new URLSearchParams(location.search).get('view') === 'clients';
const isConsolidation = new URLSearchParams(location.search).get('view') === 'consolidation';
if (new URLSearchParams(location.search).has('longname')) clients[0].firstName = 'Juan Miguel Antonio Rafael Luis Eduardo Fernando Alejandro';

function Fixture() {
  const [currentClients, setCurrentClients] = useState(clients);
  useEffect(() => {
    const update = (event: Event) => setCurrentClients(clients.slice(0, (event as CustomEvent<number>).detail));
    window.addEventListener('fixture:client-count', update);
    return () => window.removeEventListener('fixture:client-count', update);
  }, []);
  const state = { clients: currentClients, payments, collectors: [], holidays: [], rows: buildClientRows(currentClients, payments, new Set(), '2026-11-02'), today: '2026-11-02', loading: false, error: null };
  return <BrowserRouter><AuthContext.Provider value={{ user: null, profile: null, status: 'signedIn', accessError: null, signIn: async () => {}, signOut: async () => {} }}><SettingsContext.Provider value={{ settings: DEFAULT_SETTINGS, loading: false, error: null }}><DataContext.Provider value={state}><div className="content" style={{ maxWidth: 1600 }}>{isSettings ? <SettingsPage /> : isClients ? <ClientsPage /> : isConsolidation ? <LiquidationPage /> : <PrintablesPage />}</div></DataContext.Provider></SettingsContext.Provider></AuthContext.Provider></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(
  <Fixture />,
);
