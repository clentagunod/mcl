import type { Client, UserRole } from '../types';
import { dailyPayable } from './printables';

/** Admins retain the ability to enter partial repayments and final settlements. */
export function collectorMinimum(client: Client, enforce: boolean, role: UserRole | undefined): number {
  return enforce && role === 'collector' ? dailyPayable(client) : 0;
}
