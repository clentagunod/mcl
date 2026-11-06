import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { watchReconnect } from '../src/connectivity';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AccessCheck, Login, Shell } from '../src/App';
import Clients from '../src/Clients';
import Settings from '../src/Settings';
import { AccountsContent } from '@web/pages/collectors/CollectorsPage';
import { AuthContext, type AuthContextValue } from '@web/context/AuthContext';
import { DataContext } from '@web/context/DataContext';
import { SettingsContext } from '@web/context/SettingsContext';
import { DEFAULT_SETTINGS } from '@web/config/settings';
import { buildClientRows } from '@web/lib/loan';
import '@web/index.css';
import '../src/mobile.css';

const clients = [{ id: 'c0', firstName: 'Maria', lastName: 'Santos', middleName: '', address: 'Fixture only', cellphone: '', principal: 1000, interest: 100, loanTermDays: 45 as const, approvalDate: '2026-11-01', dailyAmount: 25, transactionNumber: '00002', activeLoanId: '00002', renewalCount: 1 }];
const payments = [{ id: 'receipt', clientId: 'c0', loanId: '00002', amount: 100, paymentDate: '2026-11-02', collectorId: 'collector', collectorName: 'Fixture collector', notes: '', createdAt: new Date('2026-11-02T01:00:00Z') }];
const accounts = (['collector', 'admin', 'developer'] as const).map(role => ({ uid: role, role, fullName: `Fixture ${role}`, email: `${role}@example.com`, phone: '', active: true, createdAt: null }));
function Fixture() {
  const [screen, setScreen] = useState('login');
  const [feed, setFeed] = useState('ready');
  const [configured, setConfigured] = useState(false);
  const [refreshes, setRefreshes] = useState(0);
  useEffect(() => watchReconnect(async () => {
    setRefreshes(value => value + 1);
    setFeed('ready');
  }), []);
  const auth = {
    status: 'signedIn', user: { uid: 'test' }, profile: { uid: 'test', fullName: 'Test account', role: screen === 'developer' ? 'developer' : screen === 'admin' ? 'admin' : 'collector', active: true }, accessError: null,
    signIn: async () => { await new Promise(resolve => setTimeout(resolve, 600)); throw new Error('Check your email and password.'); },
    signOut: async () => { setScreen('login'); },
  } as AuthContextValue;
  const records = feed === 'loading' ? [] : clients;
  return <AuthContext.Provider value={auth}>
    <output data-testid="refresh-count">{refreshes}</output>
    <div aria-label="Test controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {['login', 'access', 'collector', 'admin', 'developer'].map(value => <button key={value} onClick={() => { setScreen(value); setConfigured(false); }}>Show {value}</button>)}
      {['ready', 'loading', 'syncing', 'error'].map(value => <button key={value} onClick={() => setFeed(value)}>Feed {value}</button>)}
      <button onClick={() => setConfigured(true)}>Load saved settings</button>
    </div>
    <SettingsContext.Provider value={{ settings: configured ? { ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, businessName: 'Loaded business' } } : DEFAULT_SETTINGS, loading: (screen === 'admin' || screen === 'developer') && !configured, error: null }}>
      <DataContext.Provider value={{ clients: records, payments: feed === 'loading' ? [] : payments, collectors: [], holidays: [], rows: buildClientRows(records, payments, new Set(), '2026-11-02'), today: '2026-11-02', loading: feed === 'loading', error: feed === 'syncing' ? 'Displayed records are awaiting server confirmation. Connect to confirm live balances.' : feed === 'error' ? 'The records could not refresh. Your previous records are still displayed.' : null }}>
        {screen === 'login' ? <Login /> : screen === 'access' ? <AccessCheck /> : <HashRouter><Routes><Route element={<Shell />}><Route path="/settings" element={<Settings />} /><Route path="/collectors" element={<AccountsContent accounts={accounts} loading={false} error={null} />} /><Route path="*" element={<Clients />} /></Route></Routes></HashRouter>}
      </DataContext.Provider>
    </SettingsContext.Provider>
  </AuthContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
