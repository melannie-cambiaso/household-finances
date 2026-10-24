// Pure helpers for the monthly budget. No database or framework imports, so
// they can be unit tested with Node's built-in runner.

import { parseAmount, UUID_PATTERN } from "./expenses.ts";

const FRIDAY = 5;

/** How many Fridays fall in the month that starts on `month` (YYYY-MM-01). */
export function fridaysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let fridays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(Date.UTC(year, monthIndex, day)).getUTCDay() === FRIDAY) {
      fridays++;
    }
  }
  return fridays;
}

/** Planned amount of a per-Friday income source: rate * Fridays in the month. */
export function perFridayPlanned(rate: number | null, month: string): number {
  if (rate === null) return 0;
  return rate * fridaysInMonth(month);
}

export type BudgetLineInput = {
  kind: "item" | "source";
  id: string;
  plannedAmount: number;
};

export type BudgetFormParse =
  | { ok: true; lines: BudgetLineInput[] }
  // Keyed by the form field name (`item:<id>` / `source:<id>`).
  | { ok: false; errors: Record<string, string> };

const FIELD_PATTERN = /^(item|source):(.*)$/;

/**
 * Reads the budget form entries. A blank amount means "no line"; zero is a
 * valid planned amount. Entries that are not `item:<id>` or `source:<id>` are
 * ignored. Any invalid amount or id fails the whole parse, so nothing is saved
 * from a form that has a mistake.
 */
export function parseBudgetForm(
  entries: Iterable<[string, string]>,
): BudgetFormParse {
  const lines: BudgetLineInput[] = [];
  const errors: Record<string, string> = {};
  const seen = new Set<string>();

  for (const [name, raw] of entries) {
    const match = FIELD_PATTERN.exec(name);
    if (!match) continue;
    const kind = match[1] as "item" | "source";
    const id = match[2];

    if (!UUID_PATTERN.test(id)) {
      errors[name] = "Unknown field";
      continue;
    }
    if (seen.has(name)) {
      errors[name] = "Sent more than once";
      continue;
    }
    seen.add(name);

    const text = raw.trim();
    if (text === "") continue;
    const plannedAmount = text === "0" ? 0 : parseAmount(text);
    if (plannedAmount === null) {
      errors[name] = "Enter a whole amount, or leave it blank";
      continue;
    }
    lines.push({ kind, id, plannedAmount });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, lines };
}

export type Progress = {
  planned: number;
  actual: number;
  remaining: number;
  // Null when nothing was planned.
  percent: number | null;
  over: boolean;
};

/** Planned vs. actual for one row (an item, a category or an income source). */
export function progressOf(planned: number, actual: number): Progress {
  return {
    planned,
    actual,
    remaining: planned - actual,
    percent: planned > 0 ? Math.round((actual / planned) * 100) : null,
    over: actual > planned,
  };
}
