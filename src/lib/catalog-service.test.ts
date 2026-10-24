import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  listCatalog,
  renameCategory,
  updateItem,
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
    const months = await db
      .select({ id: schema.budgetMonths.id })
      .from(schema.budgetMonths)
      .where(inArray(schema.budgetMonths.householdId, householdIds));
    const monthIds = months.map((m) => m.id);
    if (monthIds.length > 0) {
      await db
        .delete(schema.budgetLines)
        .where(inArray(schema.budgetLines.budgetMonthId, monthIds));
    }
    await db
      .delete(schema.budgetMonths)
      .where(inArray(schema.budgetMonths.householdId, householdIds));
    await db
      .delete(schema.expenses)
      .where(inArray(schema.expenses.householdId, householdIds));
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
      .delete(schema.accounts)
      .where(inArray(schema.accounts.householdId, householdIds));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.householdId, householdIds));
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

  describe("items", () => {
    // Items live in a category; expenses and budget lines point at items.
    async function seedCatalog(label: string) {
      const seed = await seedHousehold(label);
      const category = async (name: string) => {
        const result = await createCategory(db, seed.householdId, name);
        assert.equal(result.ok, true);
        return result.ok ? result.id : "";
      };
      const [user] = await db
        .insert(schema.users)
        .values({
          householdId: seed.householdId,
          name: label,
          email: `${label}-${randomUUID()}@test.invalid`,
        })
        .returning();
      const [account] = await db
        .insert(schema.accounts)
        .values({ householdId: seed.householdId, name: "Salary", kind: "salary" })
        .returning();
      return {
        ...seed,
        homeId: await category("Home"),
        healthId: await category("Health"),
        userId: user.id,
        accountId: account.id,
      };
    }
    type CatalogSeed = Awaited<ReturnType<typeof seedCatalog>>;

    const itemOf = (categoryId: string, name = "Rent", reimbursementPct: number | null = null) => ({
      name,
      categoryId,
      reimbursementPct,
    });

    async function makeItem(seed: CatalogSeed, categoryId: string, name = "Rent", pct: number | null = null) {
      const result = await createItem(db, seed.householdId, itemOf(categoryId, name, pct));
      assert.equal(result.ok, true);
      return result.ok ? result.id : "";
    }

    async function rowOf(id: string) {
      const [row] = await db.select().from(schema.items).where(eq(schema.items.id, id));
      return row;
    }

    async function spend(seed: CatalogSeed, itemId: string, reimbursementPct: number | null = null) {
      const [expense] = await db
        .insert(schema.expenses)
        .values({
          householdId: seed.householdId,
          itemId,
          accountId: seed.accountId,
          budgetMonth: "2026-10-01",
          spentOn: "2026-10-05",
          amount: 1_000,
          reimbursementPct,
          createdBy: seed.userId,
        })
        .returning();
      return expense.id;
    }

    async function plan(seed: CatalogSeed, itemId: string, month = "2026-10-01") {
      const [budget] = await db
        .insert(schema.budgetMonths)
        .values({ householdId: seed.householdId, month })
        .returning();
      await db
        .insert(schema.budgetLines)
        .values({ budgetMonthId: budget.id, itemId, plannedAmount: 5_000 });
    }

    it("creates an item with or without a reimbursement percentage", async () => {
      const seed = await seedCatalog("item-create");
      const plain = await makeItem(seed, seed.homeId, "Rent");
      const refundable = await makeItem(seed, seed.healthId, "Doctor", 70);

      assert.equal((await rowOf(plain)).categoryId, seed.homeId);
      assert.equal((await rowOf(plain)).reimbursementPct, null);
      assert.equal((await rowOf(refundable)).reimbursementPct, 70);
    });

    it("refuses a category of another household and inserts nothing", async () => {
      const seed = await seedCatalog("item-foreign");
      const other = await seedCatalog("item-foreign-other");

      const result = await createItem(db, seed.householdId, itemOf(other.homeId));
      assert.deepEqual(result, { ok: false, error: "category_not_found" });
      const none = await db
        .select({ id: schema.items.id })
        .from(schema.items)
        .where(eq(schema.items.categoryId, other.homeId));
      assert.equal(none.length, 0);
    });

    it("refuses a duplicate name in the same category, but allows it in another", async () => {
      const seed = await seedCatalog("item-dup");
      await makeItem(seed, seed.homeId, "Internet");

      const dup = await createItem(db, seed.householdId, itemOf(seed.homeId, "  INTERNET "));
      assert.deepEqual(dup, { ok: false, error: "duplicate_name" });

      const elsewhere = await createItem(db, seed.householdId, itemOf(seed.healthId, "Internet"));
      assert.equal(elsewhere.ok, true);
    });

    it("renames an item, changes its percentage and moves it to another category", async () => {
      const seed = await seedCatalog("item-update");
      const id = await makeItem(seed, seed.homeId, "Rnt", null);

      const result = await updateItem(db, seed.householdId, id, {
        name: "Rent",
        categoryId: seed.healthId,
        reimbursementPct: 30,
      });
      assert.deepEqual(result, { ok: true });

      const row = await rowOf(id);
      assert.equal(row.name, "Rent");
      assert.equal(row.categoryId, seed.healthId);
      assert.equal(row.reimbursementPct, 30);
    });

    it("never rewrites the percentage already frozen in existing expenses", async () => {
      const seed = await seedCatalog("item-frozen");
      const id = await makeItem(seed, seed.healthId, "Doctor", 70);
      const expenseId = await spend(seed, id, 70);

      await updateItem(db, seed.householdId, id, itemOf(seed.healthId, "Doctor", 10));

      assert.equal((await rowOf(id)).reimbursementPct, 10);
      const [expense] = await db
        .select()
        .from(schema.expenses)
        .where(eq(schema.expenses.id, expenseId));
      assert.equal(expense.reimbursementPct, 70, "history keeps the percentage it was created with");
    });

    it("may change only the case of its own name, but not take a sibling's name", async () => {
      const seed = await seedCatalog("item-rename");
      const id = await makeItem(seed, seed.homeId, "water");
      await makeItem(seed, seed.homeId, "Gas");

      assert.deepEqual(
        await updateItem(db, seed.householdId, id, itemOf(seed.homeId, "Water")),
        { ok: true },
      );
      assert.deepEqual(
        await updateItem(db, seed.householdId, id, itemOf(seed.homeId, "gas")),
        { ok: false, error: "duplicate_name" },
      );
      assert.equal((await rowOf(id)).name, "Water");
    });

    it("refuses to move an item into a category that already has that name", async () => {
      const seed = await seedCatalog("item-move-dup");
      const id = await makeItem(seed, seed.homeId, "Insurance");
      await makeItem(seed, seed.healthId, "insurance");

      const result = await updateItem(db, seed.householdId, id, itemOf(seed.healthId, "Insurance"));
      assert.deepEqual(result, { ok: false, error: "duplicate_name" });
      assert.equal((await rowOf(id)).categoryId, seed.homeId);
    });

    it("cannot update an item or move it to a category of another household", async () => {
      const seed = await seedCatalog("item-upd-attacker");
      const victim = await seedCatalog("item-upd-victim");
      const mine = await makeItem(seed, seed.homeId, "Mine");
      const theirs = await makeItem(victim, victim.homeId, "Theirs");

      assert.deepEqual(
        await updateItem(db, seed.householdId, theirs, itemOf(seed.homeId, "Stolen")),
        { ok: false, error: "item_not_found" },
      );
      assert.deepEqual(
        await updateItem(db, seed.householdId, randomUUID(), itemOf(seed.homeId)),
        { ok: false, error: "item_not_found" },
      );
      assert.deepEqual(
        await updateItem(db, seed.householdId, mine, itemOf(victim.homeId, "Mine")),
        { ok: false, error: "category_not_found" },
      );
      assert.equal((await rowOf(theirs)).name, "Theirs");
      assert.equal((await rowOf(mine)).categoryId, seed.homeId);
    });

    it("deletes an item that nothing uses", async () => {
      const seed = await seedCatalog("item-delete");
      const id = await makeItem(seed, seed.homeId, "Unused");
      const keep = await makeItem(seed, seed.homeId, "Keep");

      assert.deepEqual(await deleteItem(db, seed.householdId, id), { ok: true });
      assert.equal(await rowOf(id), undefined);
      assert.ok(await rowOf(keep), "other items are untouched");
    });

    it("refuses to delete an item with expenses or budget lines, counting both", async () => {
      const seed = await seedCatalog("item-in-use");
      const used = await makeItem(seed, seed.homeId, "Used");
      await spend(seed, used);
      await spend(seed, used);
      await plan(seed, used);
      const onlyPlanned = await makeItem(seed, seed.homeId, "Planned");
      await plan(seed, onlyPlanned, "2026-11-01");

      assert.deepEqual(await deleteItem(db, seed.householdId, used), {
        ok: false,
        error: "in_use",
        expenses: 2,
        budgetLines: 1,
      });
      assert.deepEqual(await deleteItem(db, seed.householdId, onlyPlanned), {
        ok: false,
        error: "in_use",
        expenses: 0,
        budgetLines: 1,
      });
      assert.ok(await rowOf(used));
      assert.ok(await rowOf(onlyPlanned));
    });

    it("cannot delete an item of another household or one that does not exist", async () => {
      const seed = await seedCatalog("item-del-attacker");
      const victim = await seedCatalog("item-del-victim");
      const theirs = await makeItem(victim, victim.homeId, "Theirs");

      assert.deepEqual(await deleteItem(db, seed.householdId, theirs), {
        ok: false,
        error: "item_not_found",
      });
      assert.deepEqual(await deleteItem(db, seed.householdId, randomUUID()), {
        ok: false,
        error: "item_not_found",
      });
      assert.ok(await rowOf(theirs), "the victim's item survives");
    });

    it("lists the catalog sorted by name, with usage counts and only this household's data", async () => {
      const seed = await seedCatalog("item-list");
      const other = await seedCatalog("item-list-other");
      const rent = await makeItem(seed, seed.homeId, "Rent");
      await makeItem(seed, seed.homeId, "Internet");
      const doctor = await makeItem(seed, seed.healthId, "Doctor", 70);
      await spend(seed, rent);
      await spend(seed, rent);
      await plan(seed, rent);
      await plan(seed, doctor, "2026-11-01");
      await makeItem(other, other.homeId, "Foreign");
      const emptyId = await createCategory(db, seed.householdId, "Archive");
      assert.equal(emptyId.ok, true);

      const catalog = await listCatalog(db, seed.householdId);
      assert.deepEqual(
        catalog.map((c) => c.name),
        ["Archive", "Health", "Home"],
      );
      assert.deepEqual(catalog[0].items, [], "an empty category is listed too");

      const home = catalog.find((c) => c.name === "Home");
      assert.deepEqual(
        home?.items.map((i) => [i.name, i.expenseCount, i.budgetLineCount]),
        [
          ["Internet", 0, 0],
          ["Rent", 2, 1],
        ],
      );
      const health = catalog.find((c) => c.name === "Health");
      assert.deepEqual(
        health?.items.map((i) => [i.name, i.reimbursementPct, i.expenseCount, i.budgetLineCount]),
        [["Doctor", 70, 0, 1]],
      );
    });
  });
});
