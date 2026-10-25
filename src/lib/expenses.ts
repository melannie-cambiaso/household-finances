// Pure helpers for expenses. No database or framework imports, so they can be
// unit tested with Node's built-in runner.

import { UUID_PATTERN } from "../shared/ids.ts";
import { firstOfMonth, isValidDate, isValidMonth } from "../shared/dates.ts";
import { parseAmount } from "../shared/money.ts";

const DESCRIPTION_MAX_LENGTH = 200;

/** amount * pct / 100, rounded to an integer. Zero when not reimbursable. */
export function expectedReimbursement(
  amount: number,
  pct: number | null,
): number {
  if (pct === null) return 0;
  return Math.round((amount * pct) / 100);
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
