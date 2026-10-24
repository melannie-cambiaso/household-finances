import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import { expectedReimbursement } from "./expenses.ts";
import { pendingReimbursement, type IncomeInput } from "./incomes.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;

export type IncomeContext = { householdId: string; userId: string };

export type CreateIncomeResult =
  | { ok: true; id: string }
  | { ok: false; error: IncomeRejection };

type IncomeRejection =
  | "source_not_found"
  | "account_not_found"
  | "expense_not_found"
  | "source_not_reimbursement"
  | "expense_not_reimbursable";

/**
 * Rules shared by creating and editing an income: the source, the account and
 * the related expense must belong to the household, only a reimbursement
 * source can be tied to an expense, and only to one with a percentage.
 * Returns the rejection, or null when the income may be written.
 */
async function checkIncomeTargets(
  reader: Pick<Db, "select">,
  householdId: string,
  input: IncomeInput,
): Promise<{ ok: false; error: IncomeRejection } | null> {
  const [source] = await reader
    .select({ kind: schema.incomeSources.kind })
    .from(schema.incomeSources)
    .where(
      and(
        eq(schema.incomeSources.id, input.incomeSourceId),
        eq(schema.incomeSources.householdId, householdId),
      ),
    );
  if (!source) return { ok: false, error: "source_not_found" };

  const [account] = await reader
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.id, input.accountId),
        eq(schema.accounts.householdId, householdId),
      ),
    );
  if (!account) return { ok: false, error: "account_not_found" };

  if (input.relatedExpenseId !== null) {
    if (source.kind !== "reimbursement") {
      return { ok: false, error: "source_not_reimbursement" };
    }
    const [expense] = await reader
      .select({ reimbursementPct: schema.expenses.reimbursementPct })
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.id, input.relatedExpenseId),
          eq(schema.expenses.householdId, householdId),
        ),
      );
    if (!expense) return { ok: false, error: "expense_not_found" };
    if (expense.reimbursementPct === null) {
      return { ok: false, error: "expense_not_reimbursable" };
    }
  }
  return null;
}

/**
 * Inserts an income. The source, the account and the related expense must
 * belong to the household, so ids sent by a client can never write into
 * another household. Only a reimbursement source can be tied to an expense,
 * and only to one that has a reimbursement percentage.
 */
export async function createIncome(
  db: Db,
  ctx: IncomeContext,
  input: IncomeInput,
): Promise<CreateIncomeResult> {
  const rejected = await checkIncomeTargets(db, ctx.householdId, input);
  if (rejected) return rejected;

  const [created] = await db
    .insert(schema.incomes)
    .values({
      householdId: ctx.householdId,
      incomeSourceId: input.incomeSourceId,
      accountId: input.accountId,
      budgetMonth: input.budgetMonth,
      receivedOn: input.receivedOn,
      amount: input.amount,
      relatedExpenseId: input.relatedExpenseId,
      createdBy: ctx.userId,
    })
    .returning({ id: schema.incomes.id });

  return { ok: true, id: created.id };
}

/** Incomes that count toward `budgetMonth` (first day of the month), newest first. */
export async function listIncomes(
  db: Db,
  householdId: string,
  budgetMonth: string,
) {
  return db
    .select({
      id: schema.incomes.id,
      amount: schema.incomes.amount,
      receivedOn: schema.incomes.receivedOn,
      relatedExpenseId: schema.incomes.relatedExpenseId,
      sourceName: schema.incomeSources.name,
      accountName: schema.accounts.name,
    })
    .from(schema.incomes)
    .innerJoin(
      schema.incomeSources,
      eq(schema.incomes.incomeSourceId, schema.incomeSources.id),
    )
    .innerJoin(
      schema.accounts,
      eq(schema.incomes.accountId, schema.accounts.id),
    )
    .where(
      and(
        eq(schema.incomes.householdId, householdId),
        eq(schema.incomes.budgetMonth, budgetMonth),
      ),
    )
    .orderBy(desc(schema.incomes.receivedOn), asc(schema.incomes.id));
}

/** Income sources of the household, with the account the money usually lands in. */
export async function listIncomeSources(db: Db, householdId: string) {
  return db
    .select({
      id: schema.incomeSources.id,
      name: schema.incomeSources.name,
      kind: schema.incomeSources.kind,
      defaultAccountId: schema.incomeSources.defaultAccountId,
    })
    .from(schema.incomeSources)
    .where(eq(schema.incomeSources.householdId, householdId))
    .orderBy(asc(schema.incomeSources.name));
}

/**
 * Reimbursable expenses (any month) that still have an amount owed, oldest
 * first. Pending = expected - sum of the incomes linked to the expense.
 */
export async function listPendingReimbursements(db: Db, householdId: string) {
  const rows = await db
    .select({
      id: schema.expenses.id,
      amount: schema.expenses.amount,
      spentOn: schema.expenses.spentOn,
      description: schema.expenses.description,
      reimbursementPct: schema.expenses.reimbursementPct,
      itemName: schema.items.name,
      categoryName: schema.categories.name,
      received: sql<number>`coalesce((
        select sum(${schema.incomes.amount})
        from ${schema.incomes}
        where ${schema.incomes.relatedExpenseId} = ${schema.expenses.id}
      ), 0)::int`,
    })
    .from(schema.expenses)
    .innerJoin(schema.items, eq(schema.expenses.itemId, schema.items.id))
    .innerJoin(
      schema.categories,
      eq(schema.items.categoryId, schema.categories.id),
    )
    .where(
      and(
        eq(schema.expenses.householdId, householdId),
        isNotNull(schema.expenses.reimbursementPct),
      ),
    )
    .orderBy(asc(schema.expenses.spentOn), asc(schema.expenses.id));

  return rows
    .map((row) => ({
      ...row,
      expected: expectedReimbursement(row.amount, row.reimbursementPct),
      pending: pendingReimbursement(
        row.amount,
        row.reimbursementPct,
        row.received,
      ),
    }))
    .filter((row) => row.pending > 0);
}

/** One income of the household, as the edit form needs it; null if it is not theirs. */
export async function getIncome(db: Db, householdId: string, id: string) {
  const [row] = await db
    .select({
      id: schema.incomes.id,
      incomeSourceId: schema.incomes.incomeSourceId,
      accountId: schema.incomes.accountId,
      amount: schema.incomes.amount,
      receivedOn: schema.incomes.receivedOn,
      budgetMonth: schema.incomes.budgetMonth,
      relatedExpenseId: schema.incomes.relatedExpenseId,
    })
    .from(schema.incomes)
    .where(
      and(
        eq(schema.incomes.id, id),
        eq(schema.incomes.householdId, householdId),
      ),
    );
  return row ?? null;
}

export type UpdateIncomeResult =
  | { ok: true }
  | { ok: false; error: "income_not_found" | IncomeRejection };

/**
 * Updates an income of the household. The same rules as creating apply to the
 * source, the account and the related expense. The author never changes.
 */
export async function updateIncome(
  db: Db,
  ctx: IncomeContext,
  id: string,
  input: IncomeInput,
): Promise<UpdateIncomeResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: schema.incomes.id })
      .from(schema.incomes)
      .where(
        and(
          eq(schema.incomes.id, id),
          eq(schema.incomes.householdId, ctx.householdId),
        ),
      )
      .for("update");
    if (!current) return { ok: false as const, error: "income_not_found" as const };

    const rejected = await checkIncomeTargets(tx, ctx.householdId, input);
    if (rejected) return rejected;

    await tx
      .update(schema.incomes)
      .set({
        incomeSourceId: input.incomeSourceId,
        accountId: input.accountId,
        budgetMonth: input.budgetMonth,
        receivedOn: input.receivedOn,
        amount: input.amount,
        relatedExpenseId: input.relatedExpenseId,
      })
      .where(
        and(
          eq(schema.incomes.id, id),
          eq(schema.incomes.householdId, ctx.householdId),
        ),
      );
    return { ok: true as const };
  });
}

export type DeleteIncomeResult =
  | { ok: true }
  | { ok: false; error: "income_not_found" };

/** Deletes an income of the household. Nothing else changes: pending amounts are derived. */
export async function deleteIncome(
  db: Db,
  householdId: string,
  id: string,
): Promise<DeleteIncomeResult> {
  const deleted = await db
    .delete(schema.incomes)
    .where(
      and(
        eq(schema.incomes.id, id),
        eq(schema.incomes.householdId, householdId),
      ),
    )
    .returning({ id: schema.incomes.id });
  return deleted.length > 0
    ? { ok: true }
    : { ok: false, error: "income_not_found" };
}
