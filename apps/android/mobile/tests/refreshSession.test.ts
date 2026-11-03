import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'u' } as { uid: string } | null },
  profile: { role: 'collector', active: true } as Record<string, unknown>,
  enable: vi.fn(async () => {}),
  getProfile: vi.fn(),
  getCollection: vi.fn(async (_path: string) => ({})),
}));
vi.mock('@web/config/firebase', () => ({ auth: mocks.auth, db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, ...parts: string[]) => parts.join('/'),
  doc: (_: unknown, ...parts: string[]) => parts.join('/'),
  query: (path: string) => path + '?collectors',
  where: () => ({}),
  enableNetwork: mocks.enable,
  getDocFromServer: mocks.getProfile,
  getDocsFromServer: mocks.getCollection,
}));
import { refreshSessionData } from '../src/refreshSession';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: 'u' };
  mocks.profile = { role: 'collector', active: true };
  mocks.getProfile.mockImplementation(async () => ({ data: () => mocks.profile }));
});
it('does not open authenticated feeds when signed out', async () => {
  mocks.auth.currentUser = null;
  await refreshSessionData();
  expect(mocks.enable).not.toHaveBeenCalled();
  expect(mocks.getCollection).not.toHaveBeenCalled();
});
it('refreshes collector feeds without requesting private admin settings or profiles', async () => {
  await refreshSessionData();
  expect(mocks.getCollection.mock.calls.map(call => call[0])).toEqual(['clients', 'payments', 'holidays']);
  expect(mocks.getProfile.mock.calls.map(call => call[0])).toEqual(['users/u', 'settings/Configurations/elements/paymentPolicy']);
});
it('refreshes the existing admin feeds and settings', async () => {
  mocks.profile.role = 'admin';
  await refreshSessionData();
  expect(mocks.getCollection.mock.calls.map(call => call[0])).toEqual([
    'clients', 'payments', 'holidays', 'users?collectors',
    'settings/Configurations/elements', 'settings/Printables/elements',
  ]);
});
it.each([{ role: 'collector', active: false }, { role: 'unknown', active: true }, undefined])('does not refresh data for an unauthorized profile: %j', async profile => {
  mocks.getProfile.mockResolvedValue({ data: () => profile });
  await refreshSessionData();
  expect(mocks.getCollection).not.toHaveBeenCalled();
});
it('discards the refresh when the account changes during profile verification', async () => {
  mocks.getProfile.mockImplementation(async () => {
    mocks.auth.currentUser = { uid: 'someone-else' };
    return { data: () => mocks.profile };
  });
  await refreshSessionData();
  expect(mocks.getCollection).not.toHaveBeenCalled();
});
it('allows independent feeds to refresh when one request fails', async () => {
  mocks.getCollection.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(refreshSessionData()).resolves.toBeUndefined();
  expect(mocks.getCollection).toHaveBeenCalledTimes(3);
});
