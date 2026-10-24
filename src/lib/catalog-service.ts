import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import { sameName } from "./catalog.ts";

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
