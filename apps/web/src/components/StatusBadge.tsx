import type { LoanStatus } from '../types';

const LABELS: Record<LoanStatus, string> = {
  due: 'Due',
  pending: 'Pending',
  paid: 'Paid',
};

/** Colour AND a text label, so the status never depends on colour alone. */
export function StatusBadge({ status }: { status: LoanStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}
