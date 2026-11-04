import '../../src/index.css';
import { createRoot } from 'react-dom/client';
import type { User } from 'firebase/auth';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '../../src/components/Layout';
import { DEFAULT_SETTINGS } from '../../src/config/settings';
import { AuthContext } from '../../src/context/AuthContext';
import { DataContext, type DataContextValue } from '../../src/context/DataContext';
import { SettingsContext } from '../../src/context/SettingsContext';
import { addDays } from '../../src/lib/dates';
import { buildClientRows } from '../../src/lib/loan';
import { initializeTheme } from '../../src/lib/theme';
import DashboardPage from '../../src/pages/DashboardPage';
import HolidaysPage from '../../src/pages/HolidaysPage';
import LiquidationPage from '../../src/pages/LiquidationPage';
import PrintablesPage from '../../src/pages/PrintablesPage';
import SettingsPage from '../../src/pages/SettingsPage';
import ClientsPage from '../../src/pages/clients/ClientsPage';
import { TrashContent } from '../../src/pages/clients/TrashPage';
import { AccountsContent } from '../../src/pages/collectors/CollectorsPage';
import type { Client, Holiday, Payment, UserProfile } from '../../src/types';

// Synthetic records only. Context values and the exported page content components
// replace production subscription providers. Browser tests also stub the automatic
// Trash cleanup module and block Firebase network requests before opening this file.
const today = '2026-11-04';
const profile: UserProfile = {
  uid: 'fixture-admin', role: 'admin', fullName: 'Maria Santos', email: 'maria@example.test',
  phone: '09170000001', active: true, createdAt: new Date('2026-01-10T08:00:00Z'),
};
const collectors: UserProfile[] = [
  { uid: 'collector-1', role: 'collector', fullName: 'Ana Reyes', email: 'ana@example.test', phone: '09170000002', active: true, createdAt: new Date('2026-03-01T08:00:00Z') },
  { uid: 'collector-2', role: 'collector', fullName: 'Jose Dela Cruz', email: 'jose@example.test', phone: '09170000003', active: true, createdAt: new Date('2026-04-12T08:00:00Z') },
  { uid: 'collector-3', role: 'collector', fullName: 'Carlo Garcia', email: 'carlo@example.test', phone: '09170000004', active: false, createdAt: new Date('2026-06-15T08:00:00Z') },
];
const firstNames = ['Elena', 'Roberto', 'Cristina', 'Miguel', 'Isabel', 'Daniel', 'Patricia', 'Gabriel', 'Rosa', 'Luis', 'Carmen', 'Antonio'];
const lastNames = ['Reyes', 'Dela Cruz', 'Santos', 'Garcia', 'Mendoza', 'Ramos', 'Torres', 'Flores', 'Villanueva', 'Aquino', 'Castillo', 'Navarro'];
const clients: Client[] = Array.from({ length: 36 }, (_, index) => {
  const principal = 10000 + (index % 8) * 1500;
  return {
    id: `mcl${String(index + 1).padStart(4, '0')}`,
    clientNumber: `mcl${String(index + 1).padStart(4, '0')}`,
    transactionNumber: String(index + 1).padStart(5, '0'),
    firstName: firstNames[index % firstNames.length], middleName: '',
    lastName: lastNames[(index + Math.floor(index / 12)) % lastNames.length],
    address: `Purok ${index % 6 + 1}, San Miguel, Tagum City`, cellphone: `0917${String(index + 1000000)}`,
    principal, interest: principal * .125, dailyAmount: 250 + (index % 8) * 35,
    loanTermDays: [45, 50, 58][index % 3] as 45 | 50 | 58,
    approvalDate: index < 8 ? '2026-07-15' : addDays('2026-10-01', index % 20),
  };
});
const payments: Payment[] = [];
clients.forEach((client, index) => {
  if (index % 7 === 0) {
    payments.push({
      id: `settled-${index}`, clientId: client.id, amount: client.principal + client.interest,
      paymentDate: '2026-11-03', collectorId: collectors[0].uid, collectorName: collectors[0].fullName,
      createdAt: new Date('2026-11-03T08:30:00Z'), notes: 'Final settlement',
    });
  } else {
    for (let day = 0; day < 14; day += 1) {
      if ((index + day) % 3 !== 0) continue;
      const collector = collectors[index % 2];
      const paymentDate = addDays(today, -day);
      payments.push({
        id: `receipt-${index}-${day}`, clientId: client.id, amount: client.dailyAmount!,
        paymentDate, collectorId: collector.uid, collectorName: collector.fullName,
        createdAt: new Date(`${paymentDate}T${String(7 + index % 5).padStart(2, '0')}:30:00Z`),
        notes: 'Daily payment',
      });
    }
  }
});
const holidays: Holiday[] = [
  { date: '2026-11-01', name: "All Saints' Day" },
  { date: '2026-11-30', name: 'Bonifacio Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
];
const state: DataContextValue = {
  clients, payments, collectors, holidays, today,
  rows: buildClientRows(clients, payments, new Set(holidays.map(holiday => holiday.date)), today),
  loading: false, error: null,
};
const trash = clients.slice(0, 3).map((client, index) => ({
  id: `trash-${index}`, client: { ...client, id: `trash-${index}` }, trashId: `fixture-trash-${index}`,
  deletedAt: new Date(`2026-11-0${3 - index}T08:00:00Z`), deletedByName: profile.fullName,
  status: 'trashed' as const,
}));
const route = new URLSearchParams(location.search).get('route') || '/';

initializeTheme();
createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={{
    user: { uid: profile.uid, email: profile.email } as User, profile, status: 'signedIn', accessError: null,
    signIn: async () => {}, signOut: async () => {},
  }}>
    <SettingsContext.Provider value={{ settings: DEFAULT_SETTINGS, loading: false, error: null }}>
      <DataContext.Provider value={state}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="printables" element={<PrintablesPage />} />
              <Route path="liquidation" element={<LiquidationPage />} />
              <Route path="collectors" element={<AccountsContent accounts={[profile, ...collectors]} loading={false} error={null} />} />
              <Route path="holidays" element={<HolidaysPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="trash" element={<TrashContent data={trash} loading={false} error={null} fresh />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </DataContext.Provider>
    </SettingsContext.Provider>
  </AuthContext.Provider>,
);
