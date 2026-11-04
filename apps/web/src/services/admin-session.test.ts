import { beforeEach, describe, expect, it, vi } from 'vitest';
type Snapshot = { id: string; metadata: { fromCache: boolean; hasPendingWrites: boolean }; data: () => Record<string, unknown> | undefined };
const fake = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  authEvent: null as null | ((user: { uid: string } | null) => void),
  profiles: [] as { next: (snapshot: Snapshot) => void; error: (error: Error) => void; stop: ReturnType<typeof vi.fn> }[],
  signOut: vi.fn(), stopAuth: vi.fn(),
}));
vi.mock('../config/firebase', () => ({ auth: fake.auth, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, callback: typeof fake.authEvent) => { fake.authEvent = callback; return fake.stopAuth; },
  signOut: fake.signOut,
}));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {}, doc: () => ({}),
  onSnapshot: (_: unknown, __: unknown, next: (snapshot: Snapshot) => void, error: (error: Error) => void) => {
    const stop = vi.fn(); fake.profiles.push({ next, error, stop }); return stop;
  },
}));
import { watchAdminSession, type AdminSession } from './admin-session';
function event(uid: string | null) { fake.auth.currentUser = uid ? { uid } : null; fake.authEvent!(fake.auth.currentUser); }
const snapshot = (data: Record<string, unknown> | undefined, fromCache = false, hasPendingWrites = false): Snapshot => ({ id: 'admin', metadata: { fromCache, hasPendingWrites }, data: () => data });
beforeEach(() => { vi.clearAllMocks(); fake.auth.currentUser = null; fake.profiles = []; fake.signOut.mockResolvedValue(undefined); });
describe('live administrator authorization', () => {
  it.each(['admin', 'developer'])('requires a server-confirmed %s role, supports legacy active flag, and revokes live access', role => {
    const states: AdminSession[] = []; const stop = watchAdminSession(state => states.push(state));
    event('admin'); const feed = fake.profiles[0];
    feed.next(snapshot({ role }, true));
    feed.next(snapshot({ role }, false, true));
    expect(states.at(-1)?.status).toBe('loading');
    feed.next(snapshot({ role }));
    expect(states.at(-1)?.status).toBe('signedIn');
    expect(states.at(-1)?.profile?.role).toBe(role);
    feed.next(snapshot({ role, active: false }));
    expect(states.at(-1)).toMatchObject({ status: 'signedOut', user: null, profile: null });
    expect(fake.signOut).toHaveBeenCalledOnce(); stop();
  });
  it('ignores delayed snapshots and errors after sign-out, account switch, and cleanup', () => {
    const onState = vi.fn(); const stop = watchAdminSession(onState);
    event('admin'); const old = fake.profiles[0]; event(null);
    const count = onState.mock.calls.length;
    old.next(snapshot({ role: 'admin' })); old.error(new Error('old error'));
    expect(onState).toHaveBeenCalledTimes(count);
    event('new-admin'); old.next(snapshot({ role: 'collector' }));
    expect(fake.signOut).not.toHaveBeenCalled(); expect(old.stop).toHaveBeenCalled();
    stop(); const afterStop = onState.mock.calls.length;
    fake.profiles[1].next(snapshot({ role: 'admin' }));
    expect(onState).toHaveBeenCalledTimes(afterStop); expect(fake.stopAuth).toHaveBeenCalled();
  });
  it.each([undefined, { role: 'collector', active: true }, { role: 'unexpected' }, { role: 'Developer' }])('rejects unauthorized profiles %j', data => {
    const states: AdminSession[] = []; const stop = watchAdminSession(state => states.push(state));
    event('admin'); fake.profiles[0].next(snapshot(data));
    expect(states.at(-1)?.status).toBe('signedOut'); expect(fake.signOut).toHaveBeenCalledOnce(); stop();
  });
});
