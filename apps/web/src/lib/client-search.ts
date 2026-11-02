import type { Client } from '../types';
import { publicClientId, summaryClientName } from './printables';

/** Ignore accents, case and punctuation while keeping name words searchable. */
export function normalizeClientSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

/** Partial words can appear in any order. Exact IDs rank before name matches;
 * compact matching also accepts IDs with spaces/hyphens and joined surnames.
 */
export function searchClients(clients: readonly Client[], query: string): Client[] {
  const normalized = normalizeClientSearch(query);
  const compact = normalized.replaceAll(' ', '');
  const tokens = normalized.split(' ').filter(Boolean);
  return clients.flatMap((client) => {
    const name = normalizeClientSearch(summaryClientName(client));
    const identifiers = [client.id, publicClientId(client), client.transactionNumber ?? '']
      .map((s) => normalizeClientSearch(s).replaceAll(' ', '')).filter(Boolean);
    const haystack = `${name} ${identifiers.join(' ')}`;
    if (tokens.length && !tokens.every((token) => haystack.includes(token))
      && !name.replaceAll(' ', '').includes(compact)
      && !identifiers.some((id) => id.includes(compact))) return [];
    const rank = !compact ? 0 : identifiers.includes(compact) ? 0 : name === normalized ? 1
      : identifiers.some((id) => id.startsWith(compact)) ? 2 : name.startsWith(normalized) ? 3 : 4;
    return [{ client, rank }];
  }).sort((a, b) => a.rank - b.rank || summaryClientName(a.client).localeCompare(summaryClientName(b.client)) || a.client.id.localeCompare(b.client.id))
    .map(({ client }) => client);
}
