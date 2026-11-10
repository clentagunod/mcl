import '../../src/index.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { Layout } from '../../src/components/Layout';
import { DEFAULT_SETTINGS } from '../../src/config/settings';
import { AuthContext } from '../../src/context/AuthContext';
import { DataContext } from '../../src/context/DataContext';
import { ExpensesContext } from '../../src/context/ExpensesContext';
import { SettingsContext } from '../../src/context/SettingsContext';
import { buildClientRows } from '../../src/lib/loan';
import { initializeTheme } from '../../src/lib/theme';
import ExpensesPage from '../../src/pages/ExpensesPage';
import LiquidationPage from '../../src/pages/LiquidationPage';
import SettingsPage from '../../src/pages/SettingsPage';
import type { Client, Payment } from '../../src/types';
import type { Expense, ExpenseCategory } from '../../src/types/expenses';

const params = new URLSearchParams(location.search);
const today = '2026-11-02';
const client: Client = { id: 'client', clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Ana', middleName: '', lastName: 'Reyes', address: 'Tagum', cellphone: '', principal: 10000, interest: 1250, loanTermDays: 45, approvalDate: '2026-10-01' };
const payments: Payment[] = [{ id: 'prior', clientId: client.id, amount: 9900, paymentDate: '2026-10-31', collectorId: 'c', collectorName: 'Collector', createdAt: null }, { id: 'current', clientId: client.id, amount: 600, paymentDate: today, collectorId: 'c', collectorName: 'Collector', createdAt: null }];
const cost: Expense = { id: 'cost', categoryId: 'fuel', categoryName: 'Fuel', amount: 200, expenseDate: today, description: 'Client collection trip', reference: 'REF-1', clientId: 'client', loanId: 'initial', status: 'posted', voidReason: '', revision: 1, createdBy: 'admin', updatedBy: 'admin', createdAt: new Date('2026-11-02T08:00:00Z'), updatedAt: new Date('2026-11-02T08:00:00Z') };

function Fixture() {
  const [settings, setSettings] = useState(() => ({ ...structuredClone(DEFAULT_SETTINGS),
    consolidationMetrics: params.has('defaultMetrics') ? { ...DEFAULT_SETTINGS.consolidationMetrics } : { balance: true, interestCollected: true, expenseAmount: true, netIncome: true, principalReleased: true, cashSurplus: true },
    accounting: { ...DEFAULT_SETTINGS.accounting, expensesEnabled: !params.has('disabled') } }));
  const [categories, setCategories] = useState<ExpenseCategory[]>([{ id: 'fuel', name: 'Fuel', active: true, revision: 1 }]);
  const [expenses, setExpenses] = useState<Expense[]>([cost, { ...cost, id: 'shared', clientId: '', loanId: '', amount: 50, description: 'Office supplies' }]);
  useEffect(() => {
    function updateExpense(event: Event) { const row = (event as CustomEvent<Expense>).detail; setExpenses(previous => [...previous.filter(item => item.id !== row.id), row]); }
    function updateCategory(event: Event) { const row = (event as CustomEvent<ExpenseCategory>).detail; setCategories(previous => [...previous.filter(item => item.id !== row.id), row]); }
    function updateSettings(event: Event) { setSettings((event as CustomEvent<typeof settings>).detail); }
    window.addEventListener('fixture:expense', updateExpense); window.addEventListener('fixture:category', updateCategory); window.addEventListener('fixture:settings', updateSettings);
    return () => { window.removeEventListener('fixture:expense', updateExpense); window.removeEventListener('fixture:category', updateCategory); window.removeEventListener('fixture:settings', updateSettings); };
  }, []);
  return <AuthContext.Provider value={{ user: { uid: 'admin', email: 'admin@example.test' } as User, profile: { uid: 'admin', fullName: 'Administrator', email: 'admin@example.test', phone: '', role: 'admin', active: true, createdAt: null }, status: 'signedIn', accessError: null, signIn: async () => {}, signOut: async () => {} }}>
    <SettingsContext.Provider value={{ settings, loading: false, error: null }}><DataContext.Provider value={{ clients: [client], payments, rows: buildClientRows([client], payments, new Set(), today), today, holidays: [], collectors: [], loading: false, error: null }}>
      <ExpensesContext.Provider value={{ categories, expenses, fresh: !params.has('offline'), loading: false, error: null }}>
        <MemoryRouter initialEntries={[params.get('route') || '/liquidation']}><Routes><Route element={<Layout />}><Route path="liquidation" element={<LiquidationPage />} /><Route path="expenses" element={<ExpensesPage />} /><Route path="settings" element={<SettingsPage />} /></Route></Routes></MemoryRouter>
      </ExpensesContext.Provider></DataContext.Provider></SettingsContext.Provider>
  </AuthContext.Provider>;
}
initializeTheme();
createRoot(document.getElementById('root')!).render(<Fixture />);
