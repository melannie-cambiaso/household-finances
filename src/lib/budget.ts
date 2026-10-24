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

export type ItemMeta = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
};

export type SourceMeta = {
  id: string;
  name: string;
  kind: "fixed" | "per_friday" | "reimbursement";
};

export type ProgressRow = {
  id: string;
  name: string;
  progress: Progress;
  // Spending or income with no budget line for it.
  unplanned: boolean;
};

export type CategoryProgress = {
  id: string;
  name: string;
  progress: Progress;
  items: ProgressRow[];
};

export type SourceProgress = ProgressRow & { kind: SourceMeta["kind"] };

export type ProgressReport = {
  categories: CategoryProgress[];
  sources: SourceProgress[];
  expenseTotal: Progress;
  incomeTotal: Progress;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Planned vs. actual for a month. An item or source appears when it has a line
 * (even of zero) or any actual amount; ids that are not in `items`/`sources`
 * are ignored. Categories sum their items and the totals sum everything shown.
 */
export function buildProgressReport(input: {
  items: ItemMeta[];
  sources: SourceMeta[];
  plannedByItem: Record<string, number>;
  spentByItem: Record<string, number>;
  plannedBySource: Record<string, number>;
  receivedBySource: Record<string, number>;
}): ProgressReport {
  const has = (record: Record<string, number>, id: string) =>
    Object.hasOwn(record, id);

  const categories = new Map<string, CategoryProgress>();
  for (const item of input.items) {
    const planned = input.plannedByItem[item.id] ?? 0;
    const actual = input.spentByItem[item.id] ?? 0;
    const hasLine = has(input.plannedByItem, item.id);
    if (!hasLine && actual === 0) continue;

    const category = categories.get(item.categoryId) ?? {
      id: item.categoryId,
      name: item.categoryName,
      progress: progressOf(0, 0),
      items: [],
    };
    category.items.push({
      id: item.id,
      name: item.name,
      progress: progressOf(planned, actual),
      unplanned: !hasLine,
    });
    categories.set(item.categoryId, category);
  }

  const categoryList = [...categories.values()].sort(byName);
  for (const category of categoryList) {
    category.items.sort(byName);
    category.progress = progressOf(
      sum(category.items.map((i) => i.progress.planned)),
      sum(category.items.map((i) => i.progress.actual)),
    );
  }

  const sourceList: SourceProgress[] = [];
  for (const source of input.sources) {
    const planned = input.plannedBySource[source.id] ?? 0;
    const actual = input.receivedBySource[source.id] ?? 0;
    const hasLine = has(input.plannedBySource, source.id);
    if (!hasLine && actual === 0) continue;
    sourceList.push({
      id: source.id,
      name: source.name,
      kind: source.kind,
      progress: progressOf(planned, actual),
      unplanned: !hasLine,
    });
  }
  sourceList.sort(byName);

  return {
    categories: categoryList,
    sources: sourceList,
    expenseTotal: progressOf(
      sum(categoryList.map((c) => c.progress.planned)),
      sum(categoryList.map((c) => c.progress.actual)),
    ),
    incomeTotal: progressOf(
      sum(sourceList.map((s) => s.progress.planned)),
      sum(sourceList.map((s) => s.progress.actual)),
    ),
  };
}
