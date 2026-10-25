// Pure helpers for incomes. No database or framework imports, so they can be
// unit tested with Node's built-in runner.

import { UUID_PATTERN } from "../shared/ids.ts";
import { parseAmount } from "../shared/money.ts";
import { firstOfMonth, isValidDate, isValidMonth } from "../shared/dates.ts";
import { expectedReimbursement } from "./expenses.ts";

/** What is still owed for an expense: expected minus received, never below zero. */
export function pendingReimbursement(
  amount: number,
  pct: number | null,
  received: number,
): number {
  return Math.max(0, expectedReimbursement(amount, pct) - received);
}

export type IncomeInput = {
  incomeSourceId: string;
  accountId: string;
  amount: number;
  receivedOn: string;
  budgetMonth: string;
  relatedExpenseId: string | null;
};

export type IncomeField = keyof IncomeInput;

export type IncomeValidation =
  | { ok: true; value: IncomeInput }
  | { ok: false; errors: Partial<Record<IncomeField, string>> };

/** Validates raw form strings and returns a normalized income input. */
export function validateIncomeInput(
  raw: Record<IncomeField, string>,
): IncomeValidation {
  const errors: Partial<Record<IncomeField, string>> = {};

  const incomeSourceId = raw.incomeSourceId.trim();
  if (!UUID_PATTERN.test(incomeSourceId)) {
    errors.incomeSourceId = "Choose an income source";
  }

  const accountId = raw.accountId.trim();
  if (!UUID_PATTERN.test(accountId)) errors.accountId = "Choose an account";

  const amount = parseAmount(raw.amount);
  if (amount === null) {
    errors.amount = "Enter a whole amount greater than zero";
  }

  const receivedOn = raw.receivedOn.trim();
  const receivedOnValid = isValidDate(receivedOn);
  if (!receivedOnValid) errors.receivedOn = "Enter a valid date";

  const budgetMonthRaw = raw.budgetMonth.trim();
  let budgetMonth = "";
  if (budgetMonthRaw === "") {
    // Defaults to the month the money arrived in.
    if (receivedOnValid) budgetMonth = firstOfMonth(receivedOn);
  } else if (isValidMonth(budgetMonthRaw)) {
    budgetMonth = `${budgetMonthRaw}-01`;
  } else {
    errors.budgetMonth = "Enter a valid month";
  }

  const relatedRaw = raw.relatedExpenseId.trim();
  if (relatedRaw !== "" && !UUID_PATTERN.test(relatedRaw)) {
    errors.relatedExpenseId = "Choose an expense";
  }

  if (Object.keys(errors).length > 0 || amount === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      incomeSourceId,
      accountId,
      amount,
      receivedOn,
      budgetMonth,
      relatedExpenseId: relatedRaw === "" ? null : relatedRaw,
    },
  };
}
