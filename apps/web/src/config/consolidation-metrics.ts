export const OPTIONAL_CONSOLIDATION_METRICS = [
  { key: 'balance', label: 'Balance', description: 'Payable amount minus payments included in the report.' },
  { key: 'interestCollected', label: 'Interest collected', description: 'The interest portion of payments actually received.' },
  { key: 'expenseAmount', label: 'Recorded expenses', description: 'Paid expenses included by the current dates and filters.' },
  { key: 'netIncome', label: 'Net income', description: 'Interest collected minus recorded expenses.' },
  { key: 'principalReleased', label: 'Principal released', description: 'Principal released within the calculation window.' },
  { key: 'cashSurplus', label: 'Cash surplus / deficit', description: 'Collections minus principal released and cash expenses.' },
] as const;

export type OptionalConsolidationMetric = (typeof OPTIONAL_CONSOLIDATION_METRICS)[number]['key'];
export type ConsolidationMetricVisibility = Record<OptionalConsolidationMetric, boolean>;

export const DEFAULT_CONSOLIDATION_METRICS: ConsolidationMetricVisibility = {
  balance: false, interestCollected: false, expenseAmount: false,
  netIncome: false, principalReleased: false, cashSurplus: false,
};

export const CONSOLIDATION_METRICS = [
  ['totalPayment', 'Total payment'], ['principal', 'Principal'], ['payableAmount', 'Payable Amount'],
  ['balance', 'Balance'], ['contractedInterest', 'Contracted Interest'], ['interestCollected', 'Interest collected'],
  ['expenseAmount', 'Recorded expenses'], ['netIncome', 'Net income'],
  ['principalReleased', 'Principal released'], ['cashSurplus', 'Cash surplus / deficit'],
] as const;

const optionalKeys = new Set<string>(OPTIONAL_CONSOLIDATION_METRICS.map(metric => metric.key));

/** Required metrics are never configurable, even if unknown Firestore fields exist. */
export function visibleConsolidationMetrics(visibility: ConsolidationMetricVisibility) {
  return CONSOLIDATION_METRICS.filter(([key]) => !optionalKeys.has(key) || visibility[key as OptionalConsolidationMetric]);
}
