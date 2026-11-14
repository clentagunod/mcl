import { beforeEach, describe, expect, it, vi } from 'vitest';
type Snapshot = { metadata: { fromCache: boolean; hasPendingWrites: boolean }; docs: { id: string; data: () => Record<string, unknown> }[] };
const fake = vi.hoisted(() => ({ feeds: new Map<string, { next: (snapshot: Snapshot) => void; options: unknown; stop: ReturnType<typeof vi.fn> }>() }));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  doc: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(),
  onSnapshot: (path: string, options: unknown, next: (snapshot: Snapshot) => void) => {
    const stop = vi.fn(); fake.feeds.set(path, { next, options, stop }); return stop;
  },
}));
import { subscribeSettings } from './settings';

const snapshot = (expensesEnabled: boolean, fromCache = false, hasPendingWrites = false): Snapshot => ({
  metadata: { fromCache, hasPendingWrites },
  docs: [{ id: 'accountingPolicy', data: () => ({ expensesEnabled, paymentAllocation: 'principalFirst' }) }],
});
beforeEach(() => fake.feeds.clear());

describe('server-confirmed feature settings', () => {
  it('loads and updates the daily summary filter from the shared Printables document', () => {
    const onData = vi.fn(); const onError = vi.fn(); const stop = subscribeSettings(onData, onError);
    fake.feeds.get('settings/Configurations/elements')!.next(snapshot(false));
    const printables = fake.feeds.get('settings/Printables/elements')!;
    printables.next({ metadata: { fromCache: false, hasPendingWrites: false }, docs: [] });
    expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({ summary: { onlyClientsWithPayments: true } }));
    for (const onlyClientsWithPayments of [false, true]) {
      printables.next({ metadata: { fromCache: false, hasPendingWrites: false }, docs: [{ id: 'summaryTemplate', data: () => ({ onlyClientsWithPayments }) }] });
      expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({ summary: { onlyClientsWithPayments } }));
    }
    expect(onError).not.toHaveBeenCalled(); stop();
  });
  it('does not enable expense feeds from cached settings or uncommitted local policy writes', () => {
    const onData = vi.fn(); const onError = vi.fn(); const stop = subscribeSettings(onData, onError);
    const configurations = fake.feeds.get('settings/Configurations/elements')!;
    const printables = fake.feeds.get('settings/Printables/elements')!;
    expect(configurations.options).toEqual({ includeMetadataChanges: true });
    configurations.next(snapshot(true, true));
    printables.next({ metadata: { fromCache: false, hasPendingWrites: false }, docs: [] });
    expect(onData).not.toHaveBeenCalled();
    configurations.next(snapshot(false));
    expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({ accounting: { expensesEnabled: false, paymentAllocation: 'principalFirst' } }));
    onData.mockClear();
    configurations.next(snapshot(true, false, true));
    expect(onData).not.toHaveBeenCalled();
    configurations.next(snapshot(true));
    expect(onData).toHaveBeenCalledOnce();
    expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({ accounting: { expensesEnabled: true, paymentAllocation: 'principalFirst' } }));
    expect(onError).not.toHaveBeenCalled();
    stop(); expect(configurations.stop).toHaveBeenCalledOnce(); expect(printables.stop).toHaveBeenCalledOnce();
  });
});
