import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import {
  createExpense,
  listAccounts,
  listExpenses,
  listItems,
} from "./expense-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

describe("expense service", { skip: !url }, () => {
  const sql = postgres(url ?? "postgres://unused", { prepare: false });
  const db = drizzle(sql, { schema });

  const householdIds: string[] = [];

  async function seedHousehold(label: string, reimbursementPct: number | null) {
    const [household] = await db
      .insert(schema.households)
      .values({ name: `test-${label}-${randomUUID()}` })
      .returning();
    householdIds.push(household.id);

    const [user] = await db
      .insert(schema.users)
      .values({
        householdId: household.id,
        name: label,
        email: `${label}-${randomUUID()}@test.invalid`,
      })
      .returning();
    const [account] = await db
      .insert(schema.accounts)
      .values({ householdId: household.id, name: "Salary", kind: "salary" })
      .returning();
    const [category] = await db
      .insert(schema.categories)
      .values({ householdId: household.id, name: "Health" })
      .returning();
    const [item] = await db
      .insert(schema.items)
      .values({ categoryId: category.id, name: "Doctor", reimbursementPct })
      .returning();

    return {
      householdId: household.id,
      userId: user.id,
      accountId: account.id,
      itemId: item.id,
    };
  }

  let mine: Awaited<ReturnType<typeof seedHousehold>>;
  let other: Awaited<ReturnType<typeof seedHousehold>>;

  before(async () => {
    mine = await seedHousehold("mine", 70);
    other = await seedHousehold("other", null);
  });

  after(async () => {
    // Children first, to respect the foreign keys.
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
      await db
        .delete(schema.accounts)
        .where(eq(schema.accounts.householdId, householdId));
      await db
        .delete(schema.users)
        .where(eq(schema.users.householdId, householdId));
    }
    await db
      .delete(schema.households)
      .where(inArray(schema.households.id, householdIds));
    await sql.end();
  });

  const base = {
    amount: 12500,
    spentOn: "2026-10-23",
    budgetMonth: "2026-10-01",
    description: "Check-up",
  };

  it("creates an expense and freezes the item's reimbursement percentage", async () => {
    const result = await createExpense(
      db,
      { householdId: mine.householdId, userId: mine.userId },
      { ...base, itemId: mine.itemId, accountId: mine.accountId },
    );
    assert.equal(result.ok, true);

    const [row] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.householdId, mine.householdId));
    assert.equal(row.amount, 12500);
    assert.equal(row.reimbursementPct, 70);
    assert.equal(row.budgetMonth, "2026-10-01");
    assert.equal(row.spentOn, "2026-10-23");
    assert.equal(row.description, "Check-up");
    assert.equal(row.createdBy, mine.userId);
    assert.equal(row.householdId, mine.householdId);
  });

  it("keeps the stored percentage when the item changes later", async () => {
    await db
      .update(schema.items)
      .set({ reimbursementPct: 10 })
      .where(eq(schema.items.id, mine.itemId));

    const [row] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.householdId, mine.householdId));
    assert.equal(row.reimbursementPct, 70);
  });

  it("rejects an item from another household and inserts nothing", async () => {
    const result = await createExpense(
      db,
      { householdId: mine.householdId, userId: mine.userId },
      { ...base, itemId: other.itemId, accountId: mine.accountId },
    );
    assert.deepEqual(result, { ok: false, error: "item_not_found" });
    const rows = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.itemId, other.itemId));
    assert.equal(rows.length, 0);
  });

  it("rejects an account from another household and inserts nothing", async () => {
    const result = await createExpense(
      db,
      { householdId: mine.householdId, userId: mine.userId },
      { ...base, itemId: mine.itemId, accountId: other.accountId },
    );
    assert.deepEqual(result, { ok: false, error: "account_not_found" });
    const rows = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.accountId, other.accountId));
    assert.equal(rows.length, 0);
  });

  it("lists only this household's expenses for the month, newest first", async () => {
    const ctx = { householdId: mine.householdId, userId: mine.userId };
    const mineIds = { itemId: mine.itemId, accountId: mine.accountId };
    await createExpense(db, ctx, {
      ...base,
      ...mineIds,
      spentOn: "2026-10-28",
      amount: 3000,
      description: null,
    });
    // Counts toward another month: must not appear.
    await createExpense(db, ctx, {
      ...base,
      ...mineIds,
      budgetMonth: "2026-11-01",
      amount: 999,
    });
    // Another household: must not appear.
    await createExpense(
      db,
      { householdId: other.householdId, userId: other.userId },
      {
        ...base,
        itemId: other.itemId,
        accountId: other.accountId,
        amount: 777,
      },
    );

    const rows = await listExpenses(db, mine.householdId, "2026-10-01");
    assert.deepEqual(
      rows.map((r) => r.amount),
      [3000, 12500],
    );
    assert.equal(rows[0].itemName, "Doctor");
    assert.equal(rows[0].categoryName, "Health");
    assert.equal(rows[0].accountName, "Salary");
    assert.equal(rows[1].reimbursementPct, 70);
  });

  it("lists items and accounts of the household only", async () => {
    const items = await listItems(db, mine.householdId);
    assert.deepEqual(
      items.map((i) => i.id),
      [mine.itemId],
    );
    assert.equal(items[0].categoryName, "Health");

    const accounts = await listAccounts(db, mine.householdId);
    assert.deepEqual(
      accounts.map((a) => a.id),
      [mine.accountId],
    );
  });
});
