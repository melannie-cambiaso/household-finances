import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import type { ExpenseInput } from "./expenses.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;

export type ExpenseContext = { householdId: string; userId: string };

export type CreateExpenseResult =
  | { ok: true; id: string }
  | { ok: false; error: "item_not_found" | "account_not_found" };

/**
 * Inserts an expense. The item and the account must belong to the household,
 * so ids sent by a client can never write into another household. The
 * reimbursement percentage is copied from the item at this moment.
 */
export async function createExpense(
  db: Db,
  ctx: ExpenseContext,
  input: ExpenseInput,
): Promise<CreateExpenseResult> {
  const [item] = await db
    .select({ reimbursementPct: schema.items.reimbursementPct })
    .from(schema.items)
    .innerJoin(
      schema.categories,
      eq(schema.items.categoryId, schema.categories.id),
    )
    .where(
      and(
        eq(schema.items.id, input.itemId),
        eq(schema.categories.householdId, ctx.householdId),
      ),
    );
  if (!item) return { ok: false, error: "item_not_found" };

  const [account] = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.id, input.accountId),
        eq(schema.accounts.householdId, ctx.householdId),
      ),
    );
  if (!account) return { ok: false, error: "account_not_found" };

  const [created] = await db
    .insert(schema.expenses)
    .values({
      householdId: ctx.householdId,
      itemId: input.itemId,
      accountId: input.accountId,
      budgetMonth: input.budgetMonth,
      spentOn: input.spentOn,
      amount: input.amount,
      description: input.description,
      reimbursementPct: item.reimbursementPct,
      createdBy: ctx.userId,
    })
    .returning({ id: schema.expenses.id });

  return { ok: true, id: created.id };
}

/** Expenses that count toward `budgetMonth` (first day of the month), newest first. */
export async function listExpenses(
  db: Db,
  householdId: string,
  budgetMonth: string,
) {
  return db
    .select({
      id: schema.expenses.id,
      amount: schema.expenses.amount,
      spentOn: schema.expenses.spentOn,
      description: schema.expenses.description,
      reimbursementPct: schema.expenses.reimbursementPct,
      itemName: schema.items.name,
      categoryName: schema.categories.name,
      accountName: schema.accounts.name,
    })
    .from(schema.expenses)
    .innerJoin(schema.items, eq(schema.expenses.itemId, schema.items.id))
    .innerJoin(
      schema.categories,
      eq(schema.items.categoryId, schema.categories.id),
    )
    .innerJoin(
      schema.accounts,
      eq(schema.expenses.accountId, schema.accounts.id),
    )
    .where(
      and(
        eq(schema.expenses.householdId, householdId),
        eq(schema.expenses.budgetMonth, budgetMonth),
      ),
    )
    .orderBy(desc(schema.expenses.spentOn), asc(schema.expenses.id));
}

/** Items the household can record spending against, grouped by category name. */
export async function listItems(db: Db, householdId: string) {
  return db
    .select({
      id: schema.items.id,
      name: schema.items.name,
      categoryName: schema.categories.name,
      reimbursementPct: schema.items.reimbursementPct,
    })
    .from(schema.items)
    .innerJoin(
      schema.categories,
      eq(schema.items.categoryId, schema.categories.id),
    )
    .where(eq(schema.categories.householdId, householdId))
    .orderBy(asc(schema.categories.name), asc(schema.items.name));
}

export async function listAccounts(db: Db, householdId: string) {
  return db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      kind: schema.accounts.kind,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.householdId, householdId))
    .orderBy(asc(schema.accounts.name));
}
