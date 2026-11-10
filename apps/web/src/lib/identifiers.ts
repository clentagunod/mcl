export function formatSequence(value: number, digits: number, prefix = ''): string {
  if (!Number.isSafeInteger(value) || value < 1 || value >= 10 ** digits) {
    throw new Error(`${prefix ? 'Client ID' : 'Transaction number'} sequence exhausted. ${prefix ? 'Increase the number of digits in Settings.' : 'The five digit limit is 99999.'}`);
  }
  return `${prefix}${String(value).padStart(digits, '0')}`;
}

/** An empty epoch represents all installations before optional numbering resets. */
export function identifierEpoch(data: Record<string, unknown> | undefined): string {
  const epoch = data?.identifierEpoch;
  if (epoch === undefined) return '';
  if (typeof epoch !== 'string' || !epoch) throw new Error('The identifier allocation state is invalid. Check the numbering counters.');
  return epoch;
}

export function currentIdentifierReservation(data: Record<string, unknown> | undefined, epoch: string): boolean {
  return !!data && identifierEpoch(data) === epoch;
}
