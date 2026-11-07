import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../../db/schema.ts";
import {
  goalProgress,
  validateGoalInput,
  type GoalInput,
  type GoalProgress,
  type GoalValidationError,
} from "./rules.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;

export type CreateGoalResult =
  | { ok: true; id: string }
  | { ok: false; error: GoalValidationError };

/** Creates a savings goal for the household. */
export async function createGoal(
  db: Db,
  householdId: string,
  raw: GoalInput,
): Promise<CreateGoalResult> {
  const checked = validateGoalInput(raw);
  if (!checked.ok) return checked;

  const [created] = await db
    .insert(schema.savingsGoals)
    .values({
      householdId,
      name: checked.value.name,
      targetAmount: checked.value.targetAmount,
      targetDate: checked.value.targetDate,
    })
    .returning({ id: schema.savingsGoals.id });
  return { ok: true, id: created.id };
}

export type UpdateGoalResult =
  | { ok: true }
  | { ok: false; error: "goal_not_found" | GoalValidationError };

/** Renames a goal, or changes its target amount or date. Archiving is separate. */
export async function updateGoal(
  db: Db,
  householdId: string,
  id: string,
  raw: GoalInput,
): Promise<UpdateGoalResult> {
  const checked = validateGoalInput(raw);
  if (!checked.ok) return checked;

  const updated = await db
    .update(schema.savingsGoals)
    .set({
      name: checked.value.name,
      targetAmount: checked.value.targetAmount,
      targetDate: checked.value.targetDate,
    })
    .where(
      and(
        eq(schema.savingsGoals.id, id),
        eq(schema.savingsGoals.householdId, householdId),
      ),
    )
    .returning({ id: schema.savingsGoals.id });
  return updated.length > 0 ? { ok: true } : { ok: false, error: "goal_not_found" };
}

export type ArchiveGoalResult =
  | { ok: true }
  | { ok: false; error: "goal_not_found" };

/**
 * Archives a goal: it stops counting as active and can no longer receive
 * contributions. There is no delete, so its transfers keep their history.
 */
export async function archiveGoal(
  db: Db,
  householdId: string,
  id: string,
): Promise<ArchiveGoalResult> {
  const archived = await db
    .update(schema.savingsGoals)
    .set({ archivedAt: sql`now()` })
    .where(
      and(
        eq(schema.savingsGoals.id, id),
        eq(schema.savingsGoals.householdId, householdId),
        // `= null` is never true in SQL, so only isNull matches an active goal.
        isNull(schema.savingsGoals.archivedAt),
      ),
    )
    .returning({ id: schema.savingsGoals.id });
  return archived.length > 0 ? { ok: true } : { ok: false, error: "goal_not_found" };
}

/** One goal of the household, as the edit form needs it; null if it is not theirs. */
export async function getGoal(db: Db, householdId: string, id: string) {
  const [row] = await db
    .select({
      id: schema.savingsGoals.id,
      name: schema.savingsGoals.name,
      targetAmount: schema.savingsGoals.targetAmount,
      targetDate: schema.savingsGoals.targetDate,
      archivedAt: schema.savingsGoals.archivedAt,
    })
    .from(schema.savingsGoals)
    .where(
      and(
        eq(schema.savingsGoals.id, id),
        eq(schema.savingsGoals.householdId, householdId),
      ),
    );
  return row ?? null;
}

export type GoalWithProgress = {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  archivedAt: Date | null;
  progress: GoalProgress;
};

/**
 * Every goal of the household, active ones first, each with its progress
 * derived from the transfers linked to it. Computed on every call, never stored.
 */
export async function listGoalsWithProgress(
  db: Db,
  householdId: string,
): Promise<GoalWithProgress[]> {
  const goals = await db
    .select({
      id: schema.savingsGoals.id,
      name: schema.savingsGoals.name,
      targetAmount: schema.savingsGoals.targetAmount,
      targetDate: schema.savingsGoals.targetDate,
      archivedAt: schema.savingsGoals.archivedAt,
    })
    .from(schema.savingsGoals)
    .where(eq(schema.savingsGoals.householdId, householdId))
    // Active goals first: an archived one has a value, and ASC would put the
    // nulls (the active goals) last without nulls first.
    .orderBy(
      sql`${schema.savingsGoals.archivedAt} asc nulls first`,
      asc(schema.savingsGoals.createdAt),
    );

  const contributed = await db
    .select({
      goalId: schema.transfers.goalId,
      total: sql<number>`coalesce(sum(${schema.transfers.amount}), 0)::float8`,
    })
    .from(schema.transfers)
    .where(
      and(
        eq(schema.transfers.householdId, householdId),
        isNotNull(schema.transfers.goalId),
      ),
    )
    .groupBy(schema.transfers.goalId);

  const byGoal = new Map<string, number>();
  for (const row of contributed) {
    if (row.goalId !== null) byGoal.set(row.goalId, Number(row.total));
  }

  return goals.map((goal) => ({
    ...goal,
    progress: goalProgress(goal.targetAmount, byGoal.get(goal.id) ?? 0),
  }));
}
