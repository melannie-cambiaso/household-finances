// Pure helpers for expenses. No database or framework imports, so they can be
// unit tested with Node's built-in runner.

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const DESCRIPTION_MAX_LENGTH = 200;
// A plausible window for a household expense. It also excludes year 0, which
// JavaScript accepts but Postgres does not (there is no year zero).
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Digits only, or groups of three separated by dots (Chilean thousands format).
const AMOUNT_PATTERN = /^(\d+|\d{1,3}(\.\d{3})+)$/;

/** Parses a CLP amount. Returns null for anything that is not a positive integer. */
export function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (!AMOUNT_PATTERN.test(text)) return null;
  const value = Number(text.replaceAll(".", ""));
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  if (value > POSTGRES_INTEGER_MAX) return null;
  return value;
}

function inSupportedYears(value: string): boolean {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

function isValidMonth(value: string): boolean {
  return MONTH_PATTERN.test(value) && inSupportedYears(value);
}

function isValidDate(value: string): boolean {
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

/** amount * pct / 100, rounded to an integer. Zero when not reimbursable. */
export function expectedReimbursement(
  amount: number,
  pct: number | null,
): number {
  if (pct === null) return 0;
  return Math.round((amount * pct) / 100);
}

const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatClp(amount: number): string {
  return clpFormatter.format(amount);
}

export type ExpenseInput = {
  itemId: string;
  accountId: string;
  amount: number;
  spentOn: string;
  budgetMonth: string;
  description: string | null;
};

export type ExpenseField = keyof ExpenseInput;

export type ExpenseValidation =
  | { ok: true; value: ExpenseInput }
  | { ok: false; errors: Partial<Record<ExpenseField, string>> };

/** Validates raw form strings and returns a normalized expense input. */
export function validateExpenseInput(
  raw: Record<ExpenseField, string>,
): ExpenseValidation {
  const errors: Partial<Record<ExpenseField, string>> = {};

  const itemId = raw.itemId.trim();
  if (!UUID_PATTERN.test(itemId)) errors.itemId = "Choose an item";

  const accountId = raw.accountId.trim();
  if (!UUID_PATTERN.test(accountId)) errors.accountId = "Choose an account";

  const amount = parseAmount(raw.amount);
  if (amount === null) {
    errors.amount = "Enter a whole amount greater than zero";
  }

  const spentOn = raw.spentOn.trim();
  const spentOnValid = isValidDate(spentOn);
  if (!spentOnValid) errors.spentOn = "Enter a valid date";

  const budgetMonthRaw = raw.budgetMonth.trim();
  let budgetMonth = "";
  if (budgetMonthRaw === "") {
    // Defaults to the month the expense was paid in.
    if (spentOnValid) budgetMonth = firstOfMonth(spentOn);
  } else if (isValidMonth(budgetMonthRaw)) {
    budgetMonth = `${budgetMonthRaw}-01`;
  } else {
    errors.budgetMonth = "Enter a valid month";
  }

  const descriptionRaw = raw.description.trim();
  if (descriptionRaw.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Use at most ${DESCRIPTION_MAX_LENGTH} characters`;
  }

  if (Object.keys(errors).length > 0 || amount === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      itemId,
      accountId,
      amount,
      spentOn,
      budgetMonth,
      description: descriptionRaw === "" ? null : descriptionRaw,
    },
  };
}
