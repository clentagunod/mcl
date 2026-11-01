import { createContext, useContext } from 'react';
import type { ISODate } from '../lib/dates';
import type { ClientRow } from '../lib/loan';
import type { Client, Holiday, Payment, UserProfile } from '../types';

export interface DataContextValue {
  clients: Client[];
  payments: Payment[];
  collectors: UserProfile[];
  holidays: Holiday[];
  /** Every client with their balance, due date and status already worked out. */
  rows: ClientRow[];
  today: ISODate;
  loading: boolean;
  error: string | null;
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside <DataProvider>.');
  return value;
}
