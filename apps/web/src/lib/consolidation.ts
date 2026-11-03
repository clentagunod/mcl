import type { Client, Payment } from '../types';
import { groupPaymentsByClient } from './loan';
import { round2, sumAmounts } from './money';
import { summaryClientName } from './printables';
import { isCurrentLoanPayment } from './loan-cycle';

export const CONSOLIDATION_DAYS = 58;
export interface CollectionDay { day: number; date: string; amount: number; receipts: number }
export interface ConsolidationRow {
  client: Client;
  days: CollectionDay[];
  totalPayment: number;
  principal: number;
  /** This worksheet intentionally uses principal only, as requested. */
  balance: number;
}

/** Build once per live update. Include every ledger receipt, even after payoff or
 * day 58; the matrix is a view of the ledger, not a replacement loan calculation.
 */
export function buildConsolidation(clients: readonly Client[], payments: readonly Payment[]): ConsolidationRow[] {
  const grouped = groupPaymentsByClient(payments);
  return [...clients].sort((a, b) => summaryClientName(a).localeCompare(summaryClientName(b)) || a.id.localeCompare(b.id)).map((client) => {
    const receipts = (grouped.get(client.id) ?? []).filter((p) => isCurrentLoanPayment(client, p));
    const byDate = new Map<string, number[]>();
    for (const receipt of receipts) {
      const amounts = byDate.get(receipt.paymentDate) ?? [];
      amounts.push(receipt.amount);
      byDate.set(receipt.paymentDate, amounts);
    }
    const days = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, amounts], i) => ({
      day: i + 1, date, amount: sumAmounts(amounts), receipts: amounts.length,
    }));
    const totalPayment = sumAmounts(receipts.map((payment) => payment.amount));
    return { client, days, totalPayment, principal: client.principal, balance: round2(client.principal - totalPayment) };
  });
}

export function consolidationTotals(rows: readonly ConsolidationRow[]) {
  return {
    totalPayment: sumAmounts(rows.map((row) => row.totalPayment)),
    principal: sumAmounts(rows.map((row) => row.principal)),
    balance: sumAmounts(rows.map((row) => row.balance)),
  };
}
