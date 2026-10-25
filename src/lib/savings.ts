// Pure helpers for the savings page. No database or framework imports, so they
// can be unit tested with Node's built-in runner.

import { parseAmount } from "../shared/money.ts";
import { isValidDate, firstOfMonth, shiftMonth } from "../shared/dates.ts";

export type OpeningBalance = {
  /** Whole CLP saved on the opening date. May be zero. */
  amount: number;
  /** Day the amount was counted at the start of (YYYY-MM-DD). Movements from that day on count. */
  on: string;
};

export type OpeningBalanceField = keyof OpeningBalance;

export type OpeningBalanceValidation =
  | { ok: true; value: OpeningBalance }
  | { ok: false; errors: Partial<Record<OpeningBalanceField, string>> };

/** Validates the raw form strings of the opening balance. `today` is a YYYY-MM-DD date. */
export function validateOpeningBalance(
  raw: Record<OpeningBalanceField, string>,
  today: string,
): OpeningBalanceValidation {
  const errors: Partial<Record<OpeningBalanceField, string>> = {};

  const amountText = raw.amount.trim();
  // parseAmount refuses zero, which is a valid starting point here.
  const amount = amountText === "0" ? 0 : parseAmount(amountText);
  if (amount === null) errors.amount = "Enter a whole amount of zero or more";

  const on = raw.on.trim();
  if (!isValidDate(on)) {
    errors.on = "Enter a valid date";
  } else if (on > today) {
    errors.on = "The date cannot be in the future";
  }

  if (Object.keys(errors).length > 0 || amount === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { amount, on } };
}

export type MovementKind = "expense" | "income" | "transfer_in" | "transfer_out";

export type Movement = {
  date: string;
  /** Signed: positive adds to savings, negative takes from it. */
  amount: number;
  label: string;
  kind: MovementKind;
};

export type StatementRow = Movement & {
  /** Balance right after this movement. */
  balance: number;
};

export type MonthStatement = {
  /** Balance at the start of the month; null when the opening falls inside it or after it. */
  startBalance: number | null;
  /** Balance at the end of the month; null when the month ends before the opening. */
  endBalance: number | null;
  /** The month's movements, newest first. */
  rows: StatementRow[];
};

/**
 * The balance and movements of one calendar month. `month` is a first-of-month
 * date. The opening amount is what there was at the start of the opening day,
 * so movements dated before that day are ignored and the ones on that day
 * count. Movements on the same day keep the order they were given in.
 */
export function monthStatement(
  opening: OpeningBalance,
  movements: Movement[],
  month: string,
): MonthStatement {
  const monthStart = firstOfMonth(month);
  const nextMonthStart = shiftMonth(monthStart, 1);

  if (nextMonthStart <= opening.on) {
    return { startBalance: null, endBalance: null, rows: [] };
  }

  // Array.prototype.sort is stable, so equal dates keep their given order.
  const counted = movements
    .filter((m) => m.date >= opening.on && m.date < nextMonthStart)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let balance = opening.amount;
  let startBalance: number | null = null;
  const inMonth: StatementRow[] = [];

  for (const m of counted) {
    if (m.date < monthStart) {
      balance += m.amount;
      continue;
    }
    if (startBalance === null && monthStart >= opening.on) startBalance = balance;
    balance += m.amount;
    inMonth.push({ ...m, balance });
  }
  // A month with no movements still has a starting balance.
  if (startBalance === null && monthStart >= opening.on) startBalance = balance;

  return { startBalance, endBalance: balance, rows: inMonth.reverse() };
}

/**
 * The balance on `asOf` (inclusive): the opening amount plus every movement
 * dated from the opening day on and up to `asOf`. Null when `asOf` is before
 * the opening date, because the balance was not known yet.
 */
export function currentBalance(
  opening: OpeningBalance,
  movements: Movement[],
  asOf: string,
): number | null {
  if (asOf < opening.on) return null;
  return movements
    .filter((m) => m.date >= opening.on && m.date <= asOf)
    .reduce((sum, m) => sum + m.amount, opening.amount);
}
