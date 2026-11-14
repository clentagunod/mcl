import type { Client } from '../types';

export const VALID_ID_TYPES = [
  'Philippine National ID (PhilSys ID / ePhilID)',
  'Philippine Passport',
  "Driver's License (LTO)",
  'Unified Multi-Purpose ID (UMID)',
  'Professional Regulation Commission (PRC) ID',
  'Postal ID',
  "Voter's ID (COMELEC)",
  'Senior Citizen ID',
  'PWD ID',
  "Philippine Seafarer's Identification Document (SID)",
] as const;

export interface ClientIdentityFormValues {
  validIdType?: string;
  customValidIdType?: string;
  validIdNumber?: string;
  validIdIssuedOn?: string;
  validIdIssuedAt?: string;
  coMakerName?: string;
  coMakerValidIdType?: string;
  coMakerCustomValidIdType?: string;
  coMakerValidIdNumber?: string;
  coMakerValidIdIssuedOn?: string;
  coMakerValidIdIssuedAt?: string;
  coMakerContactNumber?: string;
}

function idTypeFields(value = '') {
  const standard = (VALID_ID_TYPES as readonly string[]).includes(value);
  return { type: value && !standard ? 'custom' : value, custom: standard ? '' : value };
}

/** Preserve custom and legacy labels when opening any client editor. */
export function clientIdentityFormValues(client?: Client): ClientIdentityFormValues {
  const borrower = idTypeFields(client?.validIdType);
  const coMaker = idTypeFields(client?.coMaker?.validIdType);
  return {
    validIdType: borrower.type,
    customValidIdType: borrower.custom,
    validIdNumber: client?.validIdNumber ?? '',
    validIdIssuedOn: client?.validIdIssuedOn ?? '',
    validIdIssuedAt: client?.validIdIssuedAt ?? '',
    coMakerName: client?.coMaker?.name ?? '',
    coMakerValidIdType: coMaker.type,
    coMakerCustomValidIdType: coMaker.custom,
    coMakerValidIdNumber: client?.coMaker?.validIdNumber ?? '',
    coMakerValidIdIssuedOn: client?.coMaker?.validIdIssuedOn ?? '',
    coMakerValidIdIssuedAt: client?.coMaker?.validIdIssuedAt ?? '',
    coMakerContactNumber: client?.coMaker?.contactNumber ?? '',
  };
}
