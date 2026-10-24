import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import { perFridayPlanned } from "./budget.ts";
import { isValidDate } from "./expenses.ts";

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
