import type { ManagedUserRole, UserRole } from '../types';

/** Shared authorization policy; unknown roles never grant access. */
export function isAdminRole(role: unknown): role is 'admin' | 'developer' {
  return role === 'admin' || role === 'developer';
}

export function isManagedRole(role: unknown): role is ManagedUserRole {
  return role === 'admin' || role === 'collector';
}

export function isUserRole(role: unknown): role is UserRole {
  return isManagedRole(role) || role === 'developer';
}
