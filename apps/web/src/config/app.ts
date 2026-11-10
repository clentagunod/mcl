/** App-wide constants. Change business rules here, not inside components. */

export const APP_NAME = 'MCL Dashboard';

/** Loan terms (in collection days) offered in the "Type of Loan" dropdown. */
export const LOAN_TERMS = [30, 45, 50, 58] as const;
/** Preserve the existing form default when adding another supported duration. */
export const DEFAULT_LOAN_TERM_DAYS = 45;

/**
 * How the loan term is counted from the "Date of Approval".
 *
 * - false (default): the approval date itself is NOT a collection day; day 1 is the
 *   first collection day AFTER it (the usual case: money is released on the approval date).
 * - true: the approval date counts as day 1 if allowed by the saved Sunday policy
 *   and holiday calendar.
 */
export const COUNT_APPROVAL_DATE_AS_DAY_ONE = false;

export const ACCOUNT_MIN_PASSWORD_LENGTH = 8;

/** How many entries the dashboard's "recent payments" feed shows. */
export const RECENT_PAYMENTS_LIMIT = 15;

/** How many clients the dashboard's "due clients" table shows. */
export const DUE_CLIENTS_LIMIT = 10;
