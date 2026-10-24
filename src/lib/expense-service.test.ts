import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import {
  createExpense,
  deleteExpense,
  getExpense,
  listAccounts,
  listExpenses,
  listItems,
  updateExpense,
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
      .delete(schema.incomes)
      .where(inArray(schema.incomes.householdId, householdIds));
    await db
      .delete(schema.expenses)
      .where(inArray(schema.expenses.householdId, householdIds));
    await db
      .delete(schema.incomeSources)
      .where(inArray(schema.incomeSources.householdId, householdIds));
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

  describe("edit and delete", () => {
    // Each test builds its own household, so none depends on another.
    async function seedEdit(label: string) {
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
      const [account2] = await db
        .insert(schema.accounts)
        .values({ householdId: household.id, name: "Savings", kind: "savings" })
        .returning();
      const [category] = await db
        .insert(schema.categories)
        .values({ householdId: household.id, name: "Health" })
        .returning();
      const makeItem = async (name: string, pct: number | null) =>
        (
          await db
            .insert(schema.items)
            .values({ categoryId: category.id, name, reimbursementPct: pct })
            .returning()
        )[0].id;
      const [source] = await db
        .insert(schema.incomeSources)
        .values({
          householdId: household.id,
          name: "Refunds",
          kind: "reimbursement",
          defaultAmount: null,
          defaultAccountId: account.id,
        })
        .returning();
      return {
        householdId: household.id,
        userId: user.id,
        accountId: account.id,
        account2Id: account2.id,
        doctorId: await makeItem("Doctor", 70),
        dentistId: await makeItem("Dentist", 30),
        plainId: await makeItem("Pharmacy", null),
        sourceId: source.id,
      };
    }
    type EditSeed = Awaited<ReturnType<typeof seedEdit>>;

    const ctxOf = (seed: EditSeed) => ({
      householdId: seed.householdId,
      userId: seed.userId,
    });
    const inputOf = (seed: EditSeed, itemId: string) => ({
      itemId,
      accountId: seed.accountId,
      amount: 100_000,
      spentOn: "2026-10-05",
      budgetMonth: "2026-10-01",
      description: "original" as string | null,
    });

    async function makeExpense(seed: EditSeed, itemId: string) {
      const result = await createExpense(db, ctxOf(seed), inputOf(seed, itemId));
      assert.equal(result.ok, true);
      return result.ok ? result.id : "";
    }

    async function rowOf(id: string) {
      const [row] = await db
        .select()
        .from(schema.expenses)
        .where(eq(schema.expenses.id, id));
      return row;
    }

    async function linkIncome(seed: EditSeed, expenseId: string, amount: number) {
      const [income] = await db
        .insert(schema.incomes)
        .values({
          householdId: seed.householdId,
          incomeSourceId: seed.sourceId,
          accountId: seed.accountId,
          budgetMonth: "2026-10-01",
          receivedOn: "2026-10-20",
          amount,
          relatedExpenseId: expenseId,
          createdBy: seed.userId,
        })
        .returning();
      return income.id;
    }

    it("gets an expense of the household and nothing else", async () => {
      const mineSeed = await seedEdit("get-mine");
      const otherSeed = await seedEdit("get-other");
      const id = await makeExpense(mineSeed, mineSeed.doctorId);
      const foreign = await makeExpense(otherSeed, otherSeed.doctorId);

      const found = await getExpense(db, mineSeed.householdId, id);
      assert.equal(found?.amount, 100_000);
      assert.equal(found?.itemId, mineSeed.doctorId);
      assert.equal(found?.description, "original");

      assert.equal(await getExpense(db, mineSeed.householdId, foreign), null);
      assert.equal(await getExpense(db, mineSeed.householdId, randomUUID()), null);
    });

    it("updates the fields, keeps the author and the frozen percentage", async () => {
      const seed = await seedEdit("update");
      const id = await makeExpense(seed, seed.doctorId); // frozen at 70
      // The item's percentage changes later; history must not move.
      await db
        .update(schema.items)
        .set({ reimbursementPct: 10 })
        .where(eq(schema.items.id, seed.doctorId));

      const result = await updateExpense(db, ctxOf(seed), id, {
        ...inputOf(seed, seed.doctorId),
        amount: 120_000,
        spentOn: "2026-11-02",
        budgetMonth: "2026-11-01",
        description: null,
        accountId: seed.account2Id,
      });
      assert.deepEqual(result, { ok: true });

      const row = await rowOf(id);
      assert.equal(row.amount, 120_000);
      assert.equal(row.spentOn, "2026-11-02");
      assert.equal(row.budgetMonth, "2026-11-01");
      assert.equal(row.description, null);
      assert.equal(row.accountId, seed.account2Id);
      assert.equal(row.reimbursementPct, 70, "same item keeps the frozen percentage");
      assert.equal(row.createdBy, seed.userId);
    });

    it("re-freezes the percentage from the new item when the item changes", async () => {
      const seed = await seedEdit("rehome");
      const id = await makeExpense(seed, seed.doctorId); // 70

      assert.deepEqual(
        await updateExpense(db, ctxOf(seed), id, inputOf(seed, seed.dentistId)),
        { ok: true },
      );
      assert.equal((await rowOf(id)).reimbursementPct, 30);

      assert.deepEqual(
        await updateExpense(db, ctxOf(seed), id, inputOf(seed, seed.plainId)),
        { ok: true },
      );
      assert.equal((await rowOf(id)).reimbursementPct, null);
    });

    it("refuses an item or account from another household and changes nothing", async () => {
      const seed = await seedEdit("upd-mine");
      const otherSeed = await seedEdit("upd-other");
      const id = await makeExpense(seed, seed.doctorId);

      const badItem = await updateExpense(db, ctxOf(seed), id, {
        ...inputOf(seed, otherSeed.doctorId),
        amount: 1,
      });
      assert.deepEqual(badItem, { ok: false, error: "item_not_found" });

      const badAccount = await updateExpense(db, ctxOf(seed), id, {
        ...inputOf(seed, seed.doctorId),
        accountId: otherSeed.accountId,
        amount: 2,
      });
      assert.deepEqual(badAccount, { ok: false, error: "account_not_found" });

      const row = await rowOf(id);
      assert.equal(row.amount, 100_000);
      assert.equal(row.itemId, seed.doctorId);
      assert.equal(row.accountId, seed.accountId);
    });

    it("cannot update an expense of another household", async () => {
      const seed = await seedEdit("upd-attacker");
      const victim = await seedEdit("upd-victim");
      const id = await makeExpense(victim, victim.doctorId);

      const result = await updateExpense(db, ctxOf(seed), id, {
        ...inputOf(seed, seed.doctorId),
        amount: 1,
      });
      assert.deepEqual(result, { ok: false, error: "expense_not_found" });
      assert.equal((await rowOf(id)).amount, 100_000);

      const missing = await updateExpense(
        db,
        ctxOf(seed),
        randomUUID(),
        inputOf(seed, seed.doctorId),
      );
      assert.deepEqual(missing, { ok: false, error: "expense_not_found" });
    });

    it("refuses to make an expense non-reimbursable while incomes are linked to it", async () => {
      const seed = await seedEdit("linked");
      const id = await makeExpense(seed, seed.doctorId);
      await linkIncome(seed, id, 30_000);

      const result = await updateExpense(db, ctxOf(seed), id, {
        ...inputOf(seed, seed.plainId),
        amount: 5,
      });
      assert.deepEqual(result, { ok: false, error: "has_linked_incomes" });
      const row = await rowOf(id);
      assert.equal(row.itemId, seed.doctorId);
      assert.equal(row.reimbursementPct, 70);
      assert.equal(row.amount, 100_000);
    });

    it("deletes an expense and keeps its reimbursement incomes as plain incomes", async () => {
      const seed = await seedEdit("delete");
      const id = await makeExpense(seed, seed.doctorId);
      const keep = await makeExpense(seed, seed.doctorId);
      const incomeId = await linkIncome(seed, id, 30_000);

      assert.deepEqual(await deleteExpense(db, seed.householdId, id), { ok: true });

      assert.equal(await getExpense(db, seed.householdId, id), null);
      assert.ok(
        await getExpense(db, seed.householdId, keep),
        "other expenses are untouched",
      );
      const [income] = await db
        .select()
        .from(schema.incomes)
        .where(eq(schema.incomes.id, incomeId));
      assert.equal(income.amount, 30_000, "the income survives");
      assert.equal(income.relatedExpenseId, null, "and is no longer linked");
    });

    it("cannot delete an expense of another household or one that does not exist", async () => {
      const seed = await seedEdit("del-attacker");
      const victim = await seedEdit("del-victim");
      const id = await makeExpense(victim, victim.doctorId);
      const incomeId = await linkIncome(victim, id, 10_000);

      assert.deepEqual(await deleteExpense(db, seed.householdId, id), {
        ok: false,
        error: "expense_not_found",
      });
      assert.deepEqual(await deleteExpense(db, seed.householdId, randomUUID()), {
        ok: false,
        error: "expense_not_found",
      });

      assert.ok(
        await getExpense(db, victim.householdId, id),
        "the victim's expense survives",
      );
      const [income] = await db
        .select()
        .from(schema.incomes)
        .where(eq(schema.incomes.id, incomeId));
      assert.equal(income.relatedExpenseId, id, "and so does its link");
    });
  });
});
