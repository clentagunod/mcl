/**
 * Calendar-date helpers.
 *
 * Dates in this app (approval date, payment date, holidays) are plain calendar days,
 * stored as "YYYY-MM-DD" strings. They are NOT moments in time, so we never attach a
 * time zone to them. All arithmetic below is done in UTC purely so that daylight-saving
 * shifts or the viewer's time zone can never move a date by one day.
 */

/** A calendar date formatted as "YYYY-MM-DD". */
export type ISODate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parse(iso: ISODate): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function format(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

/** True only for real calendar dates ("2026-02-30" is rejected). */
export function isISODate(value: unknown): value is ISODate {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) && format(parse(value)) === value;
}

/** Today's date in the viewer's local time zone. */
export function todayISO(now: Date = new Date()): ISODate {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const date = parse(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

export function isSunday(iso: ISODate): boolean {
  return parse(iso).getUTCDay() === 0;
}

/** "2026-11-15" -> "2026-11". Used to group by month. */
export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "2026-11-01" -> "Nov 1, 2026" */
export function formatDate(iso: ISODate): string {
  return isISODate(iso) ? dateFormatter.format(parse(iso)) : '—';
}

/** Formats an actual moment in time (e.g. when a payment was entered). */
export function formatDateTime(date: Date | null): string {
  return date ? dateTimeFormatter.format(date) : '—';
}
