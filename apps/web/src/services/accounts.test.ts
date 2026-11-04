import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'current-admin' } as { uid: string } | null },
  provisioningAuth: { name: 'provisioning' },
  createUser: vi.fn(), deleteUser: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(),
  setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
}));
vi.mock('../config/firebase', () => ({ auth: fake.auth, db: {}, getProvisioningAuth: () => fake.provisioningAuth }));
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: fake.createUser, deleteUser: fake.deleteUser,
  signOut: fake.signOut, sendPasswordResetEmail: fake.resetPassword,
}));
vi.mock('firebase/firestore', () => ({
  collection: () => 'users', doc: (_collection: unknown, uid: string) => `users/${uid}`,
  query: vi.fn(), where: vi.fn(), serverTimestamp: () => 'server-time',
  setDoc: fake.setDoc, updateDoc: fake.updateDoc, deleteDoc: fake.deleteDoc,
}));
vi.mock('./converters', () => ({ userFromDoc: vi.fn() }));
vi.mock('./subscribe', () => ({ subscribeToQuery: vi.fn() }));

import { createAccount, deleteAccount, sendAccountPasswordReset, updateAccount } from './accounts';
import type { AccountInput } from '../types';

const input: AccountInput = { role: 'admin', fullName: 'New Admin', email: 'admin@example.com', phone: '', password: 'strong-password' };
const newUser = { uid: 'new-user' };

beforeEach(() => {
  vi.resetAllMocks();
  fake.auth.currentUser = { uid: 'current-admin' };
  fake.createUser.mockResolvedValue({ user: newUser });
  fake.setDoc.mockResolvedValue(undefined);
  fake.deleteUser.mockResolvedValue(undefined);
  fake.signOut.mockResolvedValue(undefined);
});

describe('account provisioning', () => {
  it('rejects developer provisioning before creating an Authentication login', async () => {
    // @ts-expect-error Verify the runtime guard if a caller bypasses the managed-role type.
    await expect(createAccount({ ...input, role: 'developer' })).rejects.toThrow('Choose a valid account role');
    expect(fake.createUser).not.toHaveBeenCalled();
    expect(fake.setDoc).not.toHaveBeenCalled();
  });

  it.each(['admin', 'collector'] as const)('creates a %s without replacing the current session or storing the password', async role => {
    await createAccount({ ...input, role });
    expect(fake.createUser).toHaveBeenCalledWith(fake.provisioningAuth, input.email, input.password);
    expect(fake.setDoc).toHaveBeenCalledWith('users/new-user', {
      role, fullName: input.fullName, email: input.email, phone: '', active: true, createdAt: 'server-time',
    });
    expect(fake.auth.currentUser?.uid).toBe('current-admin');
    expect(fake.signOut).toHaveBeenCalledWith(fake.provisioningAuth);
    expect(fake.deleteUser).not.toHaveBeenCalled();
  });

  it('rolls back the new login if profile creation fails and preserves the original error', async () => {
    const failure = new Error('Permission denied');
    fake.setDoc.mockRejectedValue(failure);
    fake.deleteUser.mockRejectedValue(new Error('Cleanup unavailable'));
    await expect(createAccount(input)).rejects.toBe(failure);
    expect(fake.deleteUser).toHaveBeenCalledWith(newUser);
    expect(fake.signOut).toHaveBeenCalledWith(fake.provisioningAuth);
  });

  it('cleans up the provisioning session when Auth rejects creation', async () => {
    fake.createUser.mockRejectedValue(new Error('Email already in use'));
    await expect(createAccount(input)).rejects.toThrow('Email already in use');
    expect(fake.setDoc).not.toHaveBeenCalled();
    expect(fake.signOut).toHaveBeenCalledWith(fake.provisioningAuth);
  });
});

describe('account safeguards', () => {
  it('rejects self-deletion and self-deactivation before writing to Firestore', async () => {
    await expect(deleteAccount('current-admin')).rejects.toThrow('cannot delete your own account');
    await expect(updateAccount('current-admin', { active: false })).rejects.toThrow('cannot deactivate your own account');
    expect(fake.deleteDoc).not.toHaveBeenCalled();
    expect(fake.updateDoc).not.toHaveBeenCalled();
  });

  it('allows editing your own contact details and managing other accounts', async () => {
    await updateAccount('current-admin', { fullName: 'New Name', phone: '' });
    await updateAccount('other-admin', { active: false });
    await deleteAccount('other-admin');
    expect(fake.updateDoc).toHaveBeenCalledWith('users/current-admin', { fullName: 'New Name', phone: '' });
    expect(fake.updateDoc).toHaveBeenCalledWith('users/other-admin', { active: false });
    expect(fake.deleteDoc).toHaveBeenCalledWith('users/other-admin');
  });

  it('requires a session before any account mutation', async () => {
    fake.auth.currentUser = null;
    await expect(createAccount(input)).rejects.toThrow('Sign in');
    await expect(updateAccount('other', { fullName: 'Changed' })).rejects.toThrow('Sign in');
    await expect(deleteAccount('other')).rejects.toThrow('Sign in');
    await expect(sendAccountPasswordReset(input.email)).rejects.toThrow('Sign in');
    expect(fake.createUser).not.toHaveBeenCalled();
    expect(fake.updateDoc).not.toHaveBeenCalled();
    expect(fake.deleteDoc).not.toHaveBeenCalled();
    expect(fake.resetPassword).not.toHaveBeenCalled();
  });
});
