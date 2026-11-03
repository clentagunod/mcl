const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

// Matches the supported renewal range and leaves exact integer centavo headroom.
export const MAX_MONEY = 999_999_999;
export function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    && value <= MAX_MONEY && Math.round(value * 100) / 100 === value;
}

/** 11250 -> "₱11,250.00" */
export function formatPeso(amount: number): string {
  return pesoFormatter.format(amount);
}

/** Rounds to centavos so repeated additions never accumulate floating-point noise. */
export function round2(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Like Number() for a text input, but an empty or invalid entry counts as 0 (for live previews). */
export function parseMoneyOrZero(value: string): number {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) ? round2(parsed) : 0;
}

export function sumAmounts(amounts: readonly number[]): number {
  return round2(amounts.reduce((total, amount) => total + amount, 0));
}
