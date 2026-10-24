import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import {
  createCategory,
  deleteCategory,
  renameCategory,
} from "./catalog-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

describe("catalog service", { skip: !url }, () => {
  const sql = postgres(url ?? "postgres://unused", { prepare: false });
  const db = drizzle(sql, { schema });

  const householdIds: string[] = [];

  // Each test builds its own household, so none depends on another.
  async function seedHousehold(label: string) {
    const [household] = await db
      .insert(schema.households)
      .values({ name: `test-${label}-${randomUUID()}` })
      .returning();
    householdIds.push(household.id);
    return { householdId: household.id };
  }

  async function namesOf(householdId: string) {
    const rows = await db
      .select({ name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.householdId, householdId));
    return rows.map((r) => r.name).sort();
  }

  after(async () => {
    // Children first, to respect the foreign keys.
    for (const householdId of householdIds) {
      const categories = await db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.householdId, householdId));
      const categoryIds = categories.map((c) => c.id);
      if (categoryIds.length > 0) {
        await db
          .delete(schema.items)
          .where(inArray(schema.items.categoryId, categoryIds));
      }
      await db
        .delete(schema.categories)
        .where(eq(schema.categories.householdId, householdId));
    }
    await db
      .delete(schema.households)
      .where(inArray(schema.households.id, householdIds));
    await sql.end();
  });

  it("creates a category in the household", async () => {
    const seed = await seedHousehold("create");
    const result = await createCategory(db, seed.householdId, "Groceries");
    assert.equal(result.ok, true);
    assert.deepEqual(await namesOf(seed.householdId), ["Groceries"]);
  });

  it("refuses a duplicate name ignoring case and spaces, and inserts nothing", async () => {
    const seed = await seedHousehold("dup");
    await createCategory(db, seed.householdId, "Health Care");

    for (const name of ["health care", "  HEALTH   CARE "]) {
      const result = await createCategory(db, seed.householdId, name);
      assert.deepEqual(result, { ok: false, error: "duplicate_name" }, name);
    }
    assert.deepEqual(await namesOf(seed.householdId), ["Health Care"]);
  });

  it("allows the same name in two different households", async () => {
    const mine = await seedHousehold("same-mine");
    const other = await seedHousehold("same-other");
    assert.equal((await createCategory(db, mine.householdId, "Rent")).ok, true);
    assert.equal((await createCategory(db, other.householdId, "Rent")).ok, true);
  });

  it("renames a category, and may change only the case of its own name", async () => {
    const seed = await seedHousehold("rename");
    const created = await createCategory(db, seed.householdId, "food");
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.deepEqual(
      await renameCategory(db, seed.householdId, created.id, "Food"),
      { ok: true },
    );
    assert.deepEqual(await namesOf(seed.householdId), ["Food"]);

    assert.deepEqual(
      await renameCategory(db, seed.householdId, created.id, "Groceries"),
      { ok: true },
    );
    assert.deepEqual(await namesOf(seed.householdId), ["Groceries"]);
  });

  it("refuses to rename onto another category's name and changes nothing", async () => {
    const seed = await seedHousehold("rename-dup");
    await createCategory(db, seed.householdId, "Rent");
    const second = await createCategory(db, seed.householdId, "Utilities");
    assert.equal(second.ok, true);
    if (!second.ok) return;

    const result = await renameCategory(db, seed.householdId, second.id, " rent ");
    assert.deepEqual(result, { ok: false, error: "duplicate_name" });
    assert.deepEqual(await namesOf(seed.householdId), ["Rent", "Utilities"]);
  });

  it("cannot rename a category of another household or one that does not exist", async () => {
    const seed = await seedHousehold("ren-attacker");
    const victim = await seedHousehold("ren-victim");
    const created = await createCategory(db, victim.householdId, "Secret");
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.deepEqual(
      await renameCategory(db, seed.householdId, created.id, "Hacked"),
      { ok: false, error: "category_not_found" },
    );
    assert.deepEqual(
      await renameCategory(db, seed.householdId, randomUUID(), "Nope"),
      { ok: false, error: "category_not_found" },
    );
    assert.deepEqual(await namesOf(victim.householdId), ["Secret"]);
  });

  it("deletes an empty category", async () => {
    const seed = await seedHousehold("delete");
    const created = await createCategory(db, seed.householdId, "Temporary");
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.deepEqual(await deleteCategory(db, seed.householdId, created.id), { ok: true });
    assert.deepEqual(await namesOf(seed.householdId), []);
  });

  it("refuses to delete a category that has items, saying how many", async () => {
    const seed = await seedHousehold("delete-items");
    const created = await createCategory(db, seed.householdId, "Home");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await db.insert(schema.items).values([
      { categoryId: created.id, name: "Rent", reimbursementPct: null },
      { categoryId: created.id, name: "Internet", reimbursementPct: null },
    ]);

    const result = await deleteCategory(db, seed.householdId, created.id);
    assert.deepEqual(result, { ok: false, error: "has_items", count: 2 });
    assert.deepEqual(await namesOf(seed.householdId), ["Home"]);
  });

  it("cannot delete a category of another household or one that does not exist", async () => {
    const seed = await seedHousehold("del-attacker");
    const victim = await seedHousehold("del-victim");
    const created = await createCategory(db, victim.householdId, "Precious");
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.deepEqual(await deleteCategory(db, seed.householdId, created.id), {
      ok: false,
      error: "category_not_found",
    });
    assert.deepEqual(await deleteCategory(db, seed.householdId, randomUUID()), {
      ok: false,
      error: "category_not_found",
    });
    assert.deepEqual(await namesOf(victim.householdId), ["Precious"]);
  });
});
