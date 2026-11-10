import { createContext, useContext, type ReactNode } from 'react';
import type { Expense, ExpenseCategory } from '../types/expenses';
import { subscribeExpenseCategories, subscribeExpenses } from '../services/expenses';
import { useSubscription } from '../hooks/useSubscription';
import { useSettings } from './SettingsContext';

export interface ExpensesState {
  expenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  error: string | null;
  fresh: boolean;
}
const disabled: ExpensesState = { expenses: [], categories: [], loading: false, error: null, fresh: false };
export const ExpensesContext = createContext<ExpensesState>(disabled);
export const useExpenses = () => useContext(ExpensesContext);

function LiveExpenses({ children }: { children: ReactNode }) {
  const expenses = useSubscription(subscribeExpenses);
  const categories = useSubscription(subscribeExpenseCategories);
  return <ExpensesContext.Provider value={{ expenses: expenses.data, categories: categories.data,
    loading: expenses.loading || categories.loading, error: expenses.error ?? categories.error,
    fresh: expenses.fresh && categories.fresh }}>{children}</ExpensesContext.Provider>;
}

/** Unmount subscriptions when disabled; retained records are never deleted. */
export function ExpensesProvider({ children }: { children: ReactNode }) {
  const { settings, loading, error } = useSettings();
  return !loading && !error && settings.accounting.expensesEnabled
    ? <LiveExpenses>{children}</LiveExpenses>
    : <ExpensesContext.Provider value={disabled}>{children}</ExpensesContext.Provider>;
}
