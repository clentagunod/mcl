import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '../../src/config/settings';
import { DataContext } from '../../src/context/DataContext';
import { SettingsContext } from '../../src/context/SettingsContext';
import PrintablesPage from '../../src/pages/PrintablesPage';
import type { Client, Holiday, Payment, RenewalRecord, UserProfile } from '../../src/types';
import '../../src/index.css';
import SettingsPage from '../../src/pages/SettingsPage';
import { AuthContext } from '../../src/context/AuthContext';
import ClientsPage from '../../src/pages/clients/ClientsPage';
import { buildClientRows } from '../../src/lib/loan';
import { useEffect, useState } from 'react';
import LiquidationPage from '../../src/pages/LiquidationPage';
import { addDays } from '../../src/lib/dates';
import { RenewalTimeline } from '../../src/pages/clients/RenewalModal';
import type { User } from 'firebase/auth';
import { TrashContent } from '../../src/pages/clients/TrashPage';

// Local synthetic data only. This fixture never opens a Firebase subscription.
const count = new URLSearchParams(location.search).get('many') ? 65 : 3;
const holidays: Holiday[] = new URLSearchParams(location.search).has('holiday')
  ? [{ date: '2026-12-11', name: 'Local holiday' }] : [];
const clients: Client[] = Array.from({ length: count }, (_, i) => ({
  id: `mcl${String(i + 1).padStart(4, '0')}`, clientNumber: `mcl${String(i + 1).padStart(4, '0')}`,
  transactionNumber: String(i + 1).padStart(5, '0'), firstName: 'Juan', middleName: 'Santos',
  lastName: ['Dela Cruz', 'Reyes', 'Santos'][i % 3] + (i > 2 ? ` ${i}` : ''), address: 'Purok 1, San Miguel, Tagum City',
  cellphone: '09170000000', principal: 10000, interest: 1250, dailyAmount: 250,
  loanTermDays: [45, 50, 58][i % 3] as 45 | 50 | 58, approvalDate: '2026-10-20',
}));
if (new URLSearchParams(location.search).has('term30')) {
  clients[0].loanTermDays = 30;
  clients[0].dailyAmount = 375;
}
const payments: Payment[] = [
  { id: 'p1', clientId: clients[0].id, amount: 125, paymentDate: '2026-10-21', collectorId: 'collector1', collectorName: 'Collector One', createdAt: new Date('2026-10-21T08:00:00Z') },
  { id: 'p2', clientId: clients[0].id, amount: 125, paymentDate: '2026-10-21', collectorId: 'collector1', collectorName: 'Collector One', createdAt: new Date('2026-10-21T09:00:00Z') },
  { id: 'p3', clientId: clients[0].id, amount: 500, paymentDate: '2026-11-02', collectorId: 'admin1', collectorName: 'Admin One', notes: 'Two installments', createdAt: new Date('2026-11-02T08:00:00Z') },
  { id: 'p4', clientId: clients[1].id, amount: 250, paymentDate: '2026-11-02', collectorId: 'collector1', collectorName: 'Collector One', createdAt: new Date('2026-11-02T08:00:00Z') },
];
const renewalFixture = new URLSearchParams(location.search).get('renewal');
if (renewalFixture) {
  payments.push({ ...payments[0], id: 'settlement', amount: 10500, paymentDate: '2026-11-02' });
  clients[1].approvalDate = '2026-07-01';
  payments.push({ ...payments[3], id: 'late-settlement', amount: 11000 });
  clients[2].renewalCount = 1;
  clients[2].activeLoanId = '00003';
}
const renewalRecord: RenewalRecord = {
  id: '00004', sequence: 1, previousLoan: { ...clients[0], transactionNumber: '00001' },
  newLoan: { ...clients[0], transactionNumber: '00004', principal: 20000, interest: 2500, dailyAmount: 450, loanTermDays: 50, approvalDate: '2026-11-02' },
  totalPaid: 11250, paidOn: '2026-11-02', dueDate: '2026-12-11', newDueDate: '2026-12-30', approvedBy: 'admin1', approvedByName: 'Admin One',
  notes: 'Renewal approved after review.', createdAt: new Date('2026-11-02T08:00:00Z'),
};
const fixtureProfile: UserProfile | null = renewalFixture ? { uid: 'admin1', role: renewalFixture === 'collector' ? 'collector' : renewalFixture === 'developer' ? 'developer' : 'admin', fullName: 'Admin One', email: '', phone: '', active: true, createdAt: null } : null;
if (new URLSearchParams(location.search).has('latepayments')) {
  clients[2].approvalDate = '2026-07-31';
  for (let i = 0; i < 60; i += 1) payments.push({ id: `late-${i}`, clientId: clients[2].id, amount: 100, paymentDate: addDays('2026-08-01', i), collectorId: 'collector1', collectorName: 'Collector One', createdAt: null });
}
if (new URLSearchParams(location.search).has('longaddress')) clients[0].address = 'Purok 1, San Miguel, Tagum City. '.repeat(80) + 'X'.repeat(2000);
const isSettings = new URLSearchParams(location.search).get('view') === 'settings';
const isClients = new URLSearchParams(location.search).get('view') === 'clients';
const isTrash = new URLSearchParams(location.search).get('view') === 'trash';
const isConsolidation = new URLSearchParams(location.search).get('view') === 'consolidation';
// Preserve full-metric accounting fixtures; production defaults show the four required metrics.
const fixtureSettings = { ...DEFAULT_SETTINGS, consolidationMetrics: isConsolidation ? { balance: true, interestCollected: true, expenseAmount: true, netIncome: true, principalReleased: true, cashSurplus: true } : DEFAULT_SETTINGS.consolidationMetrics };
if (new URLSearchParams(location.search).has('longname')) clients[0].firstName = 'Juan Miguel Antonio Rafael Luis Eduardo Fernando Alejandro';

function Fixture() {
  const [currentClients, setCurrentClients] = useState(clients);
  const [currentPayments, setCurrentPayments] = useState(payments);
  useEffect(() => {
    const update = (event: Event) => setCurrentClients(clients.slice(0, (event as CustomEvent<number>).detail));
    const renew = () => setCurrentClients((current) => current.map((c, i) => i === 0 ? { ...c, activeLoanId: '00004', transactionNumber: '00004', renewalCount: 1, approvalDate: '2026-11-02', principal: 20000 } : c));
    const remove = (event: Event) => setCurrentClients(current => current.filter(client => !(event as CustomEvent<string[]>).detail.includes(client.id)));
    const upsert = (event: Event) => {
      const changed = (event as CustomEvent<Client>).detail;
      setCurrentClients(current => current.some(client => client.id === changed.id)
        ? current.map(client => client.id === changed.id ? changed : client)
        : [...current, changed]);
    };
    const correctPayment = (event: Event) => {
      const { id, input } = (event as CustomEvent<{ id: string; input: Partial<Payment> }>).detail;
      setCurrentPayments(current => current.map(payment => payment.id === id ? { ...payment, ...input } : payment));
    };
    window.addEventListener('fixture:remove-clients', remove);
    window.addEventListener('fixture:client-count', update);
    window.addEventListener('fixture:renew-client', renew);
    window.addEventListener('fixture:payment-updated', correctPayment);
    window.addEventListener('fixture:upsert-client', upsert);
    return () => { window.removeEventListener('fixture:client-count', update); window.removeEventListener('fixture:renew-client', renew); window.removeEventListener('fixture:remove-clients', remove); window.removeEventListener('fixture:payment-updated', correctPayment); window.removeEventListener('fixture:upsert-client', upsert); };
  }, []);
  const state = { clients: currentClients, payments: currentPayments, collectors: [], holidays, rows: buildClientRows(currentClients, currentPayments, new Set(holidays.map((holiday) => holiday.date)), '2026-11-02'), today: '2026-11-02', loading: false, error: null };
  return <BrowserRouter><AuthContext.Provider value={{ user: fixtureProfile ? { uid: 'admin1' } as User : null, profile: fixtureProfile, status: 'signedIn', accessError: null, signIn: async () => {}, signOut: async () => {} }}><SettingsContext.Provider value={{ settings: fixtureSettings, loading: false, error: null }}><DataContext.Provider value={state}><div className="content" style={{ maxWidth: 1600 }}>{new URLSearchParams(location.search).get('view') === 'renewal-timeline' ? <RenewalTimeline records={[renewalRecord]} /> : isTrash ? <TrashContent data={currentClients.map((client, index) => ({ id: client.id, client, trashId: `version-${client.id}`, deletedAt: new Date(2026, 10, 3, 12, index), deletedByName: "Admin One", status: new URLSearchParams(location.search).has("purging") && index === 0 ? "purging" : "trashed" }))} loading={false} error={null} fresh={!new URLSearchParams(location.search).has("offline")} /> : isSettings ? <SettingsPage /> : isClients ? <ClientsPage /> : isConsolidation ? <LiquidationPage /> : <PrintablesPage />}</div></DataContext.Provider></SettingsContext.Provider></AuthContext.Provider></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(
  <Fixture />,
);
