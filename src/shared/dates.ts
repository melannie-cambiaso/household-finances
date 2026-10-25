// Date and month helpers shared by every feature. A month is a first-of-month
// date (YYYY-MM-01). No database or framework imports, so they can be unit
// tested with Node's built-in runner.

// A plausible window for a household expense. It also excludes year 0, which
// JavaScript accepts but Postgres does not (there is no year zero).
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function inSupportedYears(value: string): boolean {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

export function isValidMonth(value: string): boolean {
  return MONTH_PATTERN.test(value) && inSupportedYears(value);
}

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value) || !inSupportedYears(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** "2026-10-23" -> "2026-10-01" */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Reads a `?month=YYYY-MM` param; falls back to the month of `today`. */
export function parseMonthParam(
  param: string | undefined,
  today: string,
): string {
  if (param && isValidMonth(param)) return `${param}-01`;
  return firstOfMonth(today);
}

/** "2026-10-01" -> "October 2026" */
export function formatMonthLabel(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Moves a first-of-month date by a number of months. */
export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1 + delta;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date (YYYY-MM-DD) in a time zone; the server runs in UTC. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone });
}
