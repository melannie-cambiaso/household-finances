// Pure helpers for categories and items. No database or framework imports, so
// they can be unit tested with Node's built-in runner.

import { UUID_PATTERN } from "../shared/ids.ts";

export const NAME_MAX_LENGTH = 60;

// Digits only: "70.5", "70%" or "1e2" are not whole percentages.
const PERCENT_PATTERN = /^\d{1,3}$/;

/** Collapses spaces and ignores case, so "Health  Care" and "health care" match. */
function comparable(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether two names are the same for the "no duplicates" rule. */
export function sameName(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

function checkName(raw: string): { name: string } | { error: string } {
  const name = raw.trim();
  if (name === "") return { error: "Enter a name" };
  if (name.length > NAME_MAX_LENGTH) {
    return { error: `Use at most ${NAME_MAX_LENGTH} characters` };
  }
  return { name };
}

export type CategoryNameValidation =
  | { ok: true; name: string }
  | { ok: false; error: string };

/** Validates the name of a category (to create or rename it). */
export function validateCategoryName(raw: string): CategoryNameValidation {
  const checked = checkName(raw);
  return "error" in checked
    ? { ok: false, error: checked.error }
    : { ok: true, name: checked.name };
}

export type ItemInput = {
  name: string;
  categoryId: string;
  // Null = not reimbursable.
  reimbursementPct: number | null;
};

export type ItemField = keyof ItemInput;

export type ItemValidation =
  | { ok: true; value: ItemInput }
  | { ok: false; errors: Partial<Record<ItemField, string>> };

/** Validates raw form strings and returns a normalized item input. */
export function validateItemInput(
  raw: Record<ItemField, string>,
): ItemValidation {
  const errors: Partial<Record<ItemField, string>> = {};

  const checked = checkName(raw.name);
  if ("error" in checked) errors.name = checked.error;

  const categoryId = raw.categoryId.trim();
  if (!UUID_PATTERN.test(categoryId)) errors.categoryId = "Choose a category";

  const pctText = raw.reimbursementPct.trim();
  let reimbursementPct: number | null = null;
  if (pctText !== "") {
    const value = PERCENT_PATTERN.test(pctText) ? Number(pctText) : NaN;
    if (!(value >= 0 && value <= 100)) {
      errors.reimbursementPct = "Enter a whole number from 0 to 100, or leave it blank";
    } else {
      reimbursementPct = value;
    }
  }

  if (Object.keys(errors).length > 0 || "error" in checked) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { name: checked.name, categoryId, reimbursementPct },
  };
}
