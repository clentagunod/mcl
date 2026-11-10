import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client, ClientInput } from '../types';

const fake = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>(), writes: [] as string[], queue: Promise.resolve() }));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (parent: { path?: string }, ...parts: string[]) => ({ path: [parent.path, ...parts].filter(Boolean).join('/'), id: parts.at(-1) }),
  runTransaction: (_db: unknown, callback: (tx: unknown) => Promise<void>) => {
    // Serialize commits to model the atomicity the Firestore transaction API guarantees.
    const promise = fake.queue.then(async () => {
      const pending = new Map<string, Record<string, unknown>>();
      let writing = false;
      const put = (ref: { path: string }, data: Record<string, unknown>) => { writing = true; pending.set(ref.path, data); };
      await callback({
        get: async (ref: { path: string }) => {
          if (writing) throw new Error('Read after write');
          const data = fake.documents.get(ref.path);
          return { id: ref.path.split('/').at(-1), exists: () => !!data, data: () => data ? structuredClone(data) : undefined };
        },
        set: put,
        update: (ref: { path: string }, data: Record<string, unknown>) => put(ref, { ...fake.documents.get(ref.path), ...data }),
      });
      pending.forEach((data, path) => { fake.documents.set(path, data); fake.writes.push(path); });
    });
    fake.queue = promise.catch(() => {});
    return promise;
  },
  serverTimestamp: () => 'SERVER_TIMESTAMP', Timestamp: class {},
  onSnapshot: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn(), query: vi.fn(), updateDoc: vi.fn(), where: vi.fn(), writeBatch: vi.fn(),
}));

import { addClient, completeClientRecords, updateClient } from './clients';
import { clientFromDoc } from './converters';
import { initializeSettings, saveSettings } from './settings';
import { DEFAULT_SETTINGS, mergeSettings } from '../config/settings';

const input: ClientInput = { firstName: 'Juan', lastName: 'Dela Cruz', middleName: '', address: 'San Miguel', cellphone: '09170000000', principal: 10000, interest: 1250, loanTermDays: 45, approvalDate: '2026-11-02', dailyAmount: 250 };
beforeEach(() => { fake.documents.clear(); fake.writes = []; fake.queue = Promise.resolve(); });

function clientSnapshot() {
  return clientFromDoc({ id: 'c', data: () => fake.documents.get('clients/c') } as Parameters<typeof clientFromDoc>[0]);
}
describe('stale client editor protection', () => {
  it('saves current edits but rejects a second editor with stale fields on a legacy record', async () => {
    fake.documents.set('clients/c', { ...input }); const opened = clientSnapshot();
    await updateClient('c', { ...input, address: 'Changed' }, opened);
    await expect(updateClient('c', input, opened)).rejects.toThrow('another session');
    expect(fake.documents.get('clients/c')?.address).toBe('Changed');
  });
  it('rejects an old form after renewal without changing the renewed terms', async () => {
    fake.documents.set('clients/c', { ...input }); const opened = clientSnapshot();
    fake.documents.set('clients/c', { ...input, activeLoanId: '00002', renewalCount: 1, principal: 20000 });
    await expect(updateClient('c', input, opened)).rejects.toThrow('another session');
    expect(fake.documents.get('clients/c')?.principal).toBe(20000); expect(fake.writes).toEqual([]);
  });
});

describe('client allocations', () => {
  it('creates formatted Firestore document IDs and persistent, unique five digit transaction numbers', async () => {
    await Promise.all([addClient(input), addClient(input), addClient(input)]);
    expect(fake.documents.get('clients/mcl0001')).toMatchObject({ clientNumber: 'mcl0001', transactionNumber: '00001', dailyAmount: 250 });
    expect(fake.documents.get('clients/mcl0003')).toMatchObject({ transactionNumber: '00003' });
    expect(fake.documents.get('settings/Identifiers/transactions/00002')).toEqual({ clientId: 'mcl0002' });
  });
  it('uses the current saved configuration and skips an occupied document ID', async () => {
    fake.documents.set('settings/Configurations/elements/general', { clientIdPrefix: 'loan', clientIdDigits: 2 });
    fake.documents.set('clients/loan01', { original: true });
    await addClient(input);
    expect(fake.documents.get('clients/loan01')).toEqual({ original: true });
    expect(fake.documents.get('clients/loan02')).toMatchObject({ clientNumber: 'loan02', transactionNumber: '00001' });
  });
  it('preserves legacy document IDs and payment links, then makes repeated completion a no-op', async () => {
    const legacy: Client = { ...input, id: 'firebase-auto-id', dailyAmount: undefined };
    fake.documents.set('clients/firebase-auto-id', { ...input, dailyAmount: undefined });
    fake.documents.set('payments/payment1', { clientId: legacy.id, amount: 100 });
    await completeClientRecords([legacy]);
    expect(fake.documents.get('clients/firebase-auto-id')).toMatchObject({ clientNumber: 'mcl0001', transactionNumber: '00001', dailyAmount: 250 });
    expect(fake.documents.has('clients/mcl0001')).toBe(false);
    expect(fake.documents.get('payments/payment1')).toEqual({ clientId: legacy.id, amount: 100 });
    const before = fake.writes.length;
    await completeClientRecords([legacy]); // Even a stale snapshot is checked against the current transaction document.
    expect(fake.writes).toHaveLength(before);
  });
  it('retains reservations after deletion and never reuses their numbers', async () => {
    fake.documents.set('settings/Identifiers/clients/mcl0001', { clientId: 'deleted' });
    fake.documents.set('settings/Identifiers/transactions/00001', { clientId: 'deleted' });
    await addClient(input);
    expect(fake.documents.get('clients/mcl0002')).toMatchObject({ transactionNumber: '00002' });
  });
  it('fails without partial writes when transaction numbers run out', async () => {
    fake.documents.set('settings/Configurations/elements/counters', { clientSequence: 0, transactionSequence: 99999 });
    await expect(addClient(input)).rejects.toThrow('five digit limit');
    expect(fake.writes).toHaveLength(0);
  });
  it('refuses to steal an imported number already reserved for another client', async () => {
    const legacy: Client = { ...input, id: 'legacy', transactionNumber: '00001', dailyAmount: undefined };
    fake.documents.set('clients/legacy', { ...legacy });
    fake.documents.set('settings/Identifiers/transactions/00001', { clientId: 'different' });
    await expect(completeClientRecords([legacy])).rejects.toThrow('already reserved');
    expect(fake.writes).toHaveLength(0);
  });
});

describe('shared settings persistence', () => {
  it('persists migrated A4 defaults and retains later explicit paper choices across reloads', async () => {
    const studioPath = 'settings/Printables/elements/studio';
    const legacyStudio = Object.fromEntries(Object.entries(DEFAULT_SETTINGS.studio).map(([kind, saved]) => {
      const { paperDefaultVersion: _version, ...layout } = saved;
      return [kind, { ...layout, paper: kind === 'summary' ? 'a4' : 'template' }];
    }));
    fake.documents.set(studioPath, legacyStudio);
    await initializeSettings('admin');
    const migrated = mergeSettings({ studio: fake.documents.get(studioPath) });
    expect(Object.values(migrated.studio).every(layout => layout.paper === 'a4')).toBe(true);
    await saveSettings(migrated, 'admin', migrated);
    await initializeSettings('admin');
    let reloaded = mergeSettings({ studio: fake.documents.get(studioPath) });
    expect(reloaded.studio).toEqual(migrated.studio);
    expect(Object.values(reloaded.studio).every(layout => layout.paperDefaultVersion === 2)).toBe(true);

    const selected = structuredClone(reloaded);
    selected.studio.index.paper = 'template';
    selected.studio.promissory.paper = 'letter';
    selected.studio.summary = { ...selected.studio.summary, paper: 'custom', widthMm: 190, heightMm: 260 };
    await saveSettings(selected, 'admin', reloaded);
    await initializeSettings('admin');
    reloaded = mergeSettings({ studio: fake.documents.get(studioPath) });
    expect(reloaded.studio).toEqual(selected.studio);
  });

  it('creates missing settings once and preserves every existing saved setting', async () => {
    fake.documents.set('settings/Printables/elements/promissoryTemplate', { payee: 'Existing payee' });
    await initializeSettings('admin');
    expect(fake.documents.get('settings/Configurations/elements/general')).toMatchObject({ clientIdPrefix: 'mcl', updatedBy: 'admin' });
    expect(fake.documents.get('settings/Configurations/elements/loanSchedule')).toMatchObject({ skipSundays: false, updatedBy: 'admin' });
    expect(fake.documents.get('settings/Printables/elements/promissoryTemplate')).toEqual({ payee: 'Existing payee' });
    const count = fake.writes.length;
    await initializeSettings('admin');
    expect(fake.writes).toHaveLength(count);
  });
  it('saves all component settings atomically with the authenticated editor metadata', async () => {
    const next = structuredClone(DEFAULT_SETTINGS);
    next.index.branch = 'New branch';
    next.payments.enforceDailyMinimum = true;
    next.trash.autoDeleteDays = 7;
    next.schedule.skipSundays = true;
    await saveSettings(next, 'admin', DEFAULT_SETTINGS);
    expect(fake.documents.get('settings/Printables/elements/indexTemplate')).toMatchObject({ branch: 'New branch', updatedBy: 'admin' });
    expect(fake.documents.get('settings/Configurations/elements/paymentPolicy')).toMatchObject({ enforceDailyMinimum: true, updatedBy: 'admin' });
    expect(fake.documents.get('settings/Configurations/elements/trashPolicy')).toMatchObject({ autoDeleteDays: 7, updatedBy: 'admin' });
    expect(fake.documents.get('settings/Configurations/elements/loanSchedule')).toMatchObject({ skipSundays: true, updatedBy: 'admin', updatedAt: 'SERVER_TIMESTAMP' });
    expect(fake.documents.get('settings/Configurations/elements/accountingPolicy')).toMatchObject({ paymentAllocation: 'principalFirst', expensesEnabled: false, updatedBy: 'admin' });
    expect(fake.documents.get('settings/Configurations/elements/consolidationMetrics')).toMatchObject({ ...DEFAULT_SETTINGS.consolidationMetrics, updatedBy: 'admin' });
    expect(fake.documents.get('settings/Configurations/elements/identifierPolicy')).toMatchObject({ resetWhenEmpty: false, updatedBy: 'admin' });
    expect(fake.writes).toHaveLength(10);
  });
  it('round-trips the Sunday policy and initialization preserves the saved value', async () => {
    let expected = structuredClone(DEFAULT_SETTINGS);
    for (const skipSundays of [true, false, true]) {
      const next = { ...expected, schedule: { skipSundays } };
      await saveSettings(next, 'admin', expected);
      await initializeSettings('admin');
      const actual = mergeSettings({ schedule: fake.documents.get('settings/Configurations/elements/loanSchedule') });
      expect(actual.schedule.skipSundays).toBe(skipSundays);
      expected = next;
    }
    await expect(saveSettings(DEFAULT_SETTINGS, 'admin', DEFAULT_SETTINGS)).rejects.toThrow('another session');
  });
  it('rejects stale edits without overwriting another administrator’s settings', async () => {
    fake.documents.set('settings/Printables/elements/indexTemplate', { ...DEFAULT_SETTINGS.index, branch: 'Changed remotely' });
    await expect(saveSettings(DEFAULT_SETTINGS, 'admin', DEFAULT_SETTINGS)).rejects.toThrow('another session');
    expect(fake.writes).toHaveLength(0);
  });
  it('persists accounting choices and initialization preserves saved values', async () => {
    const next = structuredClone(DEFAULT_SETTINGS);
    next.accounting = { expensesEnabled: true, paymentAllocation: 'proportional' };
    await saveSettings(next, 'admin', DEFAULT_SETTINGS);
    const writes = fake.writes.length;
    await initializeSettings('admin');
    expect(fake.writes).toHaveLength(writes);
    expect(mergeSettings({ accounting: fake.documents.get('settings/Configurations/elements/accountingPolicy') }).accounting).toEqual(next.accounting);
    await expect(saveSettings(DEFAULT_SETTINGS, 'admin', DEFAULT_SETTINGS)).rejects.toThrow('another session');
  });
});
