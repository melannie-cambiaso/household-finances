import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import {
  buildProgressReport,
  perFridayPlanned,
  type BudgetLineInput,
} from "./budget.ts";
import { isValidDate } from "../shared/dates.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;

export type CreateBudgetMonthResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: "invalid_month" };

function isFirstOfMonth(month: string): boolean {
  return isValidDate(month) && month.endsWith("-01");
}

/**
 * Creates the draft budget for `month` (first day of the month) by copying the
 * most recent earlier budget of the household. Per-Friday income lines are
 * recomputed from the calendar of the new month; every other line copies the
 * planned amount. With no earlier budget the draft starts empty. If the month
 * already has a budget it is returned untouched (`created: false`).
 */
export async function createBudgetMonth(
  db: Db,
  householdId: string,
  month: string,
): Promise<CreateBudgetMonthResult> {
  if (!isFirstOfMonth(month)) return { ok: false, error: "invalid_month" };

  return db.transaction(async (tx) => {
    const findExisting = async () => {
      const [row] = await tx
        .select({ id: schema.budgetMonths.id })
        .from(schema.budgetMonths)
        .where(
          and(
            eq(schema.budgetMonths.householdId, householdId),
            eq(schema.budgetMonths.month, month),
          ),
        );
      return row;
    };

    const existing = await findExisting();
    if (existing) return { ok: true as const, id: existing.id, created: false };

    const [previous] = await tx
      .select({ id: schema.budgetMonths.id })
      .from(schema.budgetMonths)
      .where(
        and(
          eq(schema.budgetMonths.householdId, householdId),
          lt(schema.budgetMonths.month, month),
        ),
      )
      .orderBy(desc(schema.budgetMonths.month))
      .limit(1);

    // The unique (household, month) constraint decides a race between two
    // creations: the loser inserts nothing and gets the winner's month.
    const [created] = await tx
      .insert(schema.budgetMonths)
      .values({ householdId, month, copiedFromId: previous?.id ?? null })
      .onConflictDoNothing()
      .returning({ id: schema.budgetMonths.id });
    if (!created) {
      const winner = await findExisting();
      return { ok: true as const, id: winner.id, created: false };
    }

    if (previous) {
      const previousLines = await tx
        .select()
        .from(schema.budgetLines)
        .where(eq(schema.budgetLines.budgetMonthId, previous.id));

      const sourceIds = previousLines
        .map((line) => line.incomeSourceId)
        .filter((id): id is string => id !== null);
      const sources =
        sourceIds.length === 0
          ? []
          : await tx
              .select({
                id: schema.incomeSources.id,
                kind: schema.incomeSources.kind,
                defaultAmount: schema.incomeSources.defaultAmount,
              })
              .from(schema.incomeSources)
              .where(inArray(schema.incomeSources.id, sourceIds));
      const sourceById = new Map(sources.map((s) => [s.id, s]));

      if (previousLines.length > 0) {
        await tx.insert(schema.budgetLines).values(
          previousLines.map((line) => {
            const source = line.incomeSourceId
              ? sourceById.get(line.incomeSourceId)
              : undefined;
            const plannedAmount =
              source?.kind === "per_friday"
                ? perFridayPlanned(source.defaultAmount, month)
                : line.plannedAmount;
            return {
              budgetMonthId: created.id,
              itemId: line.itemId,
              incomeSourceId: line.incomeSourceId,
              plannedAmount,
            };
          }),
        );
      }
    }

    return { ok: true as const, id: created.id, created: true };
  });
}

/** The budget of a month with its lines, or null when the month has none. */
export async function getBudgetMonth(
  db: Db,
  householdId: string,
  month: string,
) {
  const [budget] = await db
    .select()
    .from(schema.budgetMonths)
    .where(
      and(
        eq(schema.budgetMonths.householdId, householdId),
        eq(schema.budgetMonths.month, month),
      ),
    );
  if (!budget) return null;

  const lines = await db
    .select({
      id: schema.budgetLines.id,
      itemId: schema.budgetLines.itemId,
      incomeSourceId: schema.budgetLines.incomeSourceId,
      plannedAmount: schema.budgetLines.plannedAmount,
    })
    .from(schema.budgetLines)
    .where(eq(schema.budgetLines.budgetMonthId, budget.id));

  return {
    id: budget.id,
    month: budget.month,
    status: budget.status,
    confirmedAt: budget.confirmedAt,
    copiedFromId: budget.copiedFromId,
    lines,
  };
}

export type SaveBudgetLinesResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "month_not_found"
        | "month_locked"
        | "target_not_found"
        | "duplicate_target";
    };

/**
 * Replaces the lines of a draft budget with the submitted ones, all or nothing.
 * Every item and income source must belong to the household. A confirmed month
 * is locked: the service refuses, whatever the UI shows. The month row is locked
 * for the duration, so a save cannot slip in after a concurrent confirmation.
 */
export async function saveBudgetLines(
  db: Db,
  householdId: string,
  month: string,
  lines: BudgetLineInput[],
): Promise<SaveBudgetLinesResult> {
  const keys = lines.map((line) => `${line.kind}:${line.id}`);
  if (new Set(keys).size !== keys.length) {
    return { ok: false, error: "duplicate_target" };
  }
  const itemIds = lines.filter((l) => l.kind === "item").map((l) => l.id);
  const sourceIds = lines.filter((l) => l.kind === "source").map((l) => l.id);

  return db.transaction(async (tx) => {
    const [budget] = await tx
      .select({
        id: schema.budgetMonths.id,
        status: schema.budgetMonths.status,
      })
      .from(schema.budgetMonths)
      .where(
        and(
          eq(schema.budgetMonths.householdId, householdId),
          eq(schema.budgetMonths.month, month),
        ),
      )
      .for("update");
    if (!budget) return { ok: false as const, error: "month_not_found" as const };
    if (budget.status === "confirmed") {
      return { ok: false as const, error: "month_locked" as const };
    }

    if (itemIds.length > 0) {
      const owned = await tx
        .select({ id: schema.items.id })
        .from(schema.items)
        .innerJoin(
          schema.categories,
          eq(schema.items.categoryId, schema.categories.id),
        )
        .where(
          and(
            inArray(schema.items.id, itemIds),
            eq(schema.categories.householdId, householdId),
          ),
        );
      if (owned.length !== itemIds.length) {
        return { ok: false as const, error: "target_not_found" as const };
      }
    }
    if (sourceIds.length > 0) {
      const owned = await tx
        .select({ id: schema.incomeSources.id })
        .from(schema.incomeSources)
        .where(
          and(
            inArray(schema.incomeSources.id, sourceIds),
            eq(schema.incomeSources.householdId, householdId),
          ),
        );
      if (owned.length !== sourceIds.length) {
        return { ok: false as const, error: "target_not_found" as const };
      }
    }

    await tx
      .delete(schema.budgetLines)
      .where(eq(schema.budgetLines.budgetMonthId, budget.id));
    if (lines.length > 0) {
      await tx.insert(schema.budgetLines).values(
        lines.map((line) => ({
          budgetMonthId: budget.id,
          itemId: line.kind === "item" ? line.id : null,
          incomeSourceId: line.kind === "source" ? line.id : null,
          plannedAmount: line.plannedAmount,
        })),
      );
    }
    return { ok: true as const };
  });
}

export type ConfirmBudgetMonthResult =
  | { ok: true }
  | { ok: false; error: "month_not_found" };

/**
 * Locks a draft budget. One-way: there is no reopening. Confirming a month
 * that is already confirmed succeeds and keeps the original timestamp.
 */
export async function confirmBudgetMonth(
  db: Db,
  householdId: string,
  month: string,
): Promise<ConfirmBudgetMonthResult> {
  const confirmed = await db
    .update(schema.budgetMonths)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(
      and(
        eq(schema.budgetMonths.householdId, householdId),
        eq(schema.budgetMonths.month, month),
        eq(schema.budgetMonths.status, "draft"),
      ),
    )
    .returning({ id: schema.budgetMonths.id });
  if (confirmed.length > 0) return { ok: true };

  const [existing] = await db
    .select({ id: schema.budgetMonths.id })
    .from(schema.budgetMonths)
    .where(
      and(
        eq(schema.budgetMonths.householdId, householdId),
        eq(schema.budgetMonths.month, month),
      ),
    );
  return existing ? { ok: true } : { ok: false, error: "month_not_found" };
}

/**
 * Planned vs. actual for `month`: the budget lines (if the month has a budget)
 * against the expenses and incomes that count toward that budget month. A month
 * without a budget still reports its actual amounts, all as unplanned.
 */
export async function getBudgetProgress(
  db: Db,
  householdId: string,
  month: string,
) {
  const [items, sources, budget, spent, received] = await Promise.all([
    db
      .select({
        id: schema.items.id,
        name: schema.items.name,
        categoryId: schema.categories.id,
        categoryName: schema.categories.name,
      })
      .from(schema.items)
      .innerJoin(
        schema.categories,
        eq(schema.items.categoryId, schema.categories.id),
      )
      .where(eq(schema.categories.householdId, householdId)),
    db
      .select({
        id: schema.incomeSources.id,
        name: schema.incomeSources.name,
        kind: schema.incomeSources.kind,
      })
      .from(schema.incomeSources)
      .where(eq(schema.incomeSources.householdId, householdId)),
    getBudgetMonth(db, householdId, month),
    db
      .select({
        itemId: schema.expenses.itemId,
        total: sql<number>`sum(${schema.expenses.amount})::float8`,
      })
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.householdId, householdId),
          eq(schema.expenses.budgetMonth, month),
        ),
      )
      .groupBy(schema.expenses.itemId),
    db
      .select({
        sourceId: schema.incomes.incomeSourceId,
        total: sql<number>`sum(${schema.incomes.amount})::float8`,
      })
      .from(schema.incomes)
      .where(
        and(
          eq(schema.incomes.householdId, householdId),
          eq(schema.incomes.budgetMonth, month),
        ),
      )
      .groupBy(schema.incomes.incomeSourceId),
  ]);

  const plannedByItem: Record<string, number> = {};
  const plannedBySource: Record<string, number> = {};
  for (const line of budget?.lines ?? []) {
    if (line.itemId) plannedByItem[line.itemId] = line.plannedAmount;
    if (line.incomeSourceId) {
      plannedBySource[line.incomeSourceId] = line.plannedAmount;
    }
  }

  return buildProgressReport({
    items,
    sources,
    plannedByItem,
    plannedBySource,
    spentByItem: Object.fromEntries(spent.map((r) => [r.itemId, Number(r.total)])),
    receivedBySource: Object.fromEntries(
      received.map((r) => [r.sourceId, Number(r.total)]),
    ),
  });
}
