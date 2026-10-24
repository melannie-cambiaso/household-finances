import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import { sameName, type ItemInput } from "./catalog.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Serializes the writes that check a name against the others of the household:
 * two people adding the same category at once cannot both pass the check. The
 * lock is held until the transaction ends.
 */
async function lockHousehold(tx: Tx, householdId: string) {
  await tx
    .select({ id: schema.households.id })
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
    .for("update");
}

async function categoryNames(tx: Tx, householdId: string) {
  return tx
    .select({ id: schema.categories.id, name: schema.categories.name })
    .from(schema.categories)
    .where(eq(schema.categories.householdId, householdId));
}

export type CreateCategoryResult =
  | { ok: true; id: string }
  | { ok: false; error: "duplicate_name" };

/** Creates a category. `name` must already be validated and trimmed. */
export async function createCategory(
  db: Db,
  householdId: string,
  name: string,
): Promise<CreateCategoryResult> {
  return db.transaction(async (tx) => {
    await lockHousehold(tx, householdId);
    const existing = await categoryNames(tx, householdId);
    if (existing.some((category) => sameName(category.name, name))) {
      return { ok: false as const, error: "duplicate_name" as const };
    }
    const [created] = await tx
      .insert(schema.categories)
      .values({ householdId, name })
      .returning({ id: schema.categories.id });
    return { ok: true as const, id: created.id };
  });
}

export type RenameCategoryResult =
  | { ok: true }
  | { ok: false; error: "category_not_found" | "duplicate_name" };

/**
 * Renames a category of the household. It may differ from its current name
 * only in case or spacing, but not match another category's name.
 */
export async function renameCategory(
  db: Db,
  householdId: string,
  id: string,
  name: string,
): Promise<RenameCategoryResult> {
  return db.transaction(async (tx) => {
    await lockHousehold(tx, householdId);
    const all = await categoryNames(tx, householdId);
    if (!all.some((category) => category.id === id)) {
      return { ok: false as const, error: "category_not_found" as const };
    }
    if (all.some((c) => c.id !== id && sameName(c.name, name))) {
      return { ok: false as const, error: "duplicate_name" as const };
    }
    await tx
      .update(schema.categories)
      .set({ name })
      .where(
        and(
          eq(schema.categories.id, id),
          eq(schema.categories.householdId, householdId),
        ),
      );
    return { ok: true as const };
  });
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; error: "category_not_found" }
  | { ok: false; error: "has_items"; count: number };

/** Deletes an empty category of the household; one that still has items is refused. */
export async function deleteCategory(
  db: Db,
  householdId: string,
  id: string,
): Promise<DeleteCategoryResult> {
  return db.transaction(async (tx) => {
    await lockHousehold(tx, householdId);
    const [category] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.id, id),
          eq(schema.categories.householdId, householdId),
        ),
      );
    if (!category) {
      return { ok: false as const, error: "category_not_found" as const };
    }

    const [items] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.items)
      .where(eq(schema.items.categoryId, id));
    if (items.count > 0) {
      return {
        ok: false as const,
        error: "has_items" as const,
        count: items.count,
      };
    }

    await tx.delete(schema.categories).where(eq(schema.categories.id, id));
    return { ok: true as const };
  });
}

async function ownsCategory(tx: Tx, householdId: string, categoryId: string) {
  const [category] = await tx
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.id, categoryId),
        eq(schema.categories.householdId, householdId),
      ),
    );
  return Boolean(category);
}

/** Names of the items of one category, optionally leaving one item out. */
async function itemNames(tx: Tx, categoryId: string, exceptId?: string) {
  const rows = await tx
    .select({ id: schema.items.id, name: schema.items.name })
    .from(schema.items)
    .where(eq(schema.items.categoryId, categoryId));
  return rows.filter((row) => row.id !== exceptId).map((row) => row.name);
}

export type CreateItemResult =
  | { ok: true; id: string }
  | { ok: false; error: "category_not_found" | "duplicate_name" };

/** Creates an item in a category of the household. `input` must already be validated. */
export async function createItem(
  db: Db,
  householdId: string,
  input: ItemInput,
): Promise<CreateItemResult> {
  return db.transaction(async (tx) => {
    await lockHousehold(tx, householdId);
    if (!(await ownsCategory(tx, householdId, input.categoryId))) {
      return { ok: false as const, error: "category_not_found" as const };
    }
    const siblings = await itemNames(tx, input.categoryId);
    if (siblings.some((name) => sameName(name, input.name))) {
      return { ok: false as const, error: "duplicate_name" as const };
    }
    const [created] = await tx
      .insert(schema.items)
      .values({
        categoryId: input.categoryId,
        name: input.name,
        reimbursementPct: input.reimbursementPct,
      })
      .returning({ id: schema.items.id });
    return { ok: true as const, id: created.id };
  });
}

export type UpdateItemResult =
  | { ok: true }
  | {
      ok: false;
      error: "item_not_found" | "category_not_found" | "duplicate_name";
    };

/**
 * Renames an item, changes its reimbursement percentage and/or moves it to
 * another category of the household. Expenses keep the percentage they froze
 * when they were created; only new expenses see the new one.
 */
export async function updateItem(
  db: Db,
  householdId: string,
  id: string,
  input: ItemInput,
): Promise<UpdateItemResult> {
  return db.transaction(async (tx) => {
    await lockHousehold(tx, householdId);

    const [current] = await tx
      .select({ id: schema.items.id })
      .from(schema.items)
      .innerJoin(
        schema.categories,
        eq(schema.items.categoryId, schema.categories.id),
      )
      .where(
        and(
          eq(schema.items.id, id),
          eq(schema.categories.householdId, householdId),
        ),
      );
    if (!current) {
      return { ok: false as const, error: "item_not_found" as const };
    }

    if (!(await ownsCategory(tx, householdId, input.categoryId))) {
      return { ok: false as const, error: "category_not_found" as const };
    }
    const siblings = await itemNames(tx, input.categoryId, id);
    if (siblings.some((name) => sameName(name, input.name))) {
      return { ok: false as const, error: "duplicate_name" as const };
    }

    await tx
      .update(schema.items)
      .set({
        categoryId: input.categoryId,
        name: input.name,
        reimbursementPct: input.reimbursementPct,
      })
      .where(eq(schema.items.id, id));
    return { ok: true as const };
  });
}

export type DeleteItemResult =
  | { ok: true }
  | { ok: false; error: "item_not_found" }
  | { ok: false; error: "in_use"; expenses: number; budgetLines: number };

/**
 * Deletes an item of the household that nothing uses. One that has expenses or
 * budget lines is refused, with how many block it, so history is never lost.
 */
export async function deleteItem(
  db: Db,
  householdId: string,
  id: string,
): Promise<DeleteItemResult> {
  return db.transaction(async (tx) => {
    await lockHousehold(tx, householdId);

    const [item] = await tx
      .select({ id: schema.items.id })
      .from(schema.items)
      .innerJoin(
        schema.categories,
        eq(schema.items.categoryId, schema.categories.id),
      )
      .where(
        and(
          eq(schema.items.id, id),
          eq(schema.categories.householdId, householdId),
        ),
      );
    if (!item) return { ok: false as const, error: "item_not_found" as const };

    const [expenses] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.expenses)
      .where(eq(schema.expenses.itemId, id));
    const [lines] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.budgetLines)
      .where(eq(schema.budgetLines.itemId, id));
    if (expenses.count > 0 || lines.count > 0) {
      return {
        ok: false as const,
        error: "in_use" as const,
        expenses: expenses.count,
        budgetLines: lines.count,
      };
    }

    await tx.delete(schema.items).where(eq(schema.items.id, id));
    return { ok: true as const };
  });
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * Every category of the household with its items, sorted by name, and for each
 * item how many expenses and budget lines use it (what blocks deleting it).
 * Empty categories are included.
 */
export async function listCatalog(db: Db, householdId: string) {
  const [categories, items] = await Promise.all([
    db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.householdId, householdId)),
    db
      .select({
        id: schema.items.id,
        categoryId: schema.items.categoryId,
        name: schema.items.name,
        reimbursementPct: schema.items.reimbursementPct,
        expenseCount: sql<number>`(
          select count(*)::int from ${schema.expenses}
          where ${schema.expenses.itemId} = ${schema.items.id}
        )`,
        budgetLineCount: sql<number>`(
          select count(*)::int from ${schema.budgetLines}
          where ${schema.budgetLines.itemId} = ${schema.items.id}
        )`,
      })
      .from(schema.items)
      .innerJoin(
        schema.categories,
        eq(schema.items.categoryId, schema.categories.id),
      )
      .where(eq(schema.categories.householdId, householdId)),
  ]);

  return categories.sort(byName).map((category) => ({
    ...category,
    items: items
      .filter((item) => item.categoryId === category.id)
      .sort(byName),
  }));
}
