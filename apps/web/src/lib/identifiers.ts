export function formatSequence(value: number, digits: number, prefix = ''): string {
  if (!Number.isSafeInteger(value) || value < 1 || value >= 10 ** digits) {
    throw new Error(`${prefix ? 'Client ID' : 'Transaction number'} sequence exhausted. ${prefix ? 'Increase the number of digits in Settings.' : 'The five digit limit is 99999.'}`);
  }
  return `${prefix}${String(value).padStart(digits, '0')}`;
}
