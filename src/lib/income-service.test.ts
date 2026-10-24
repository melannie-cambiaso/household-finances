import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import {
  createIncome,
  listIncomes,
  listIncomeSources,
  listPendingReimbursements,
} from "./income-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

describe("income service", { skip: !url }, () => {
  const sql = postgres(url ?? "postgres://unused", { prepare: false });
  const db = drizzle(sql, { schema });

  const householdIds: string[] = [];

  async function seedHousehold(label: string) {
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
    const [fixedSource] = await db
      .insert(schema.incomeSources)
      .values({
        householdId: household.id,
        name: "Salary (me)",
        kind: "fixed",
        defaultAmount: 1_500_000,
        defaultAccountId: account.id,
      })
      .returning();
    const [reimbursementSource] = await db
      .insert(schema.incomeSources)
      .values({
        householdId: household.id,
        name: "Health reimbursement",
        kind: "reimbursement",
        defaultAmount: null,
        defaultAccountId: account.id,
      })
      .returning();
    const [category] = await db
      .insert(schema.categories)
      .values({ householdId: household.id, name: "Health" })
      .returning();
    const [reimbursableItem] = await db
      .insert(schema.items)
      .values({ categoryId: category.id, name: "Doctor", reimbursementPct: 70 })
      .returning();
    const [plainItem] = await db
      .insert(schema.items)
      .values({ categoryId: category.id, name: "Pharmacy", reimbursementPct: null })
      .returning();

    return {
      householdId: household.id,
      userId: user.id,
      accountId: account.id,
      fixedSourceId: fixedSource.id,
      reimbursementSourceId: reimbursementSource.id,
      reimbursableItemId: reimbursableItem.id,
      plainItemId: plainItem.id,
    };
  }

  type Seed = Awaited<ReturnType<typeof seedHousehold>>;

  async function insertExpense(
    seed: Seed,
    itemId: string,
    amount: number,
    reimbursementPct: number | null,
    spentOn = "2026-10-05",
  ) {
    const [expense] = await db
      .insert(schema.expenses)
      .values({
        householdId: seed.householdId,
        itemId,
        accountId: seed.accountId,
        budgetMonth: `${spentOn.slice(0, 7)}-01`,
        spentOn,
        amount,
        reimbursementPct,
        createdBy: seed.userId,
      })
      .returning();
    return expense.id;
  }

  async function countIncomes(householdId: string) {
    const rows = await db
      .select({ id: schema.incomes.id })
      .from(schema.incomes)
      .where(eq(schema.incomes.householdId, householdId));
    return rows.length;
  }

  let mine: Seed;
  let other: Seed;

  before(async () => {
    mine = await seedHousehold("mine");
    other = await seedHousehold("other");
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

  const ctx = () => ({ householdId: mine.householdId, userId: mine.userId });

  const base = () => ({
    incomeSourceId: mine.fixedSourceId,
    accountId: mine.accountId,
    amount: 1_500_000,
    receivedOn: "2026-10-28",
    budgetMonth: "2026-10-01",
    relatedExpenseId: null as string | null,
  });

  it("creates an income that is not tied to an expense", async () => {
    const result = await createIncome(db, ctx(), base());
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const [row] = await db
      .select()
      .from(schema.incomes)
      .where(eq(schema.incomes.id, result.id));
    assert.equal(row.householdId, mine.householdId);
    assert.equal(row.createdBy, mine.userId);
    assert.equal(row.amount, 1_500_000);
    assert.equal(row.budgetMonth, "2026-10-01");
    assert.equal(row.relatedExpenseId, null);
  });

  it("links a reimbursement income to the expense it covers", async () => {
    const expenseId = await insertExpense(mine, mine.reimbursableItemId, 100_000, 70);
    const result = await createIncome(db, ctx(), {
      ...base(),
      incomeSourceId: mine.reimbursementSourceId,
      amount: 30_000,
      relatedExpenseId: expenseId,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const [row] = await db
      .select()
      .from(schema.incomes)
      .where(eq(schema.incomes.id, result.id));
    assert.equal(row.relatedExpenseId, expenseId);
  });

  it("rejects a source or account from another household and inserts nothing", async () => {
    const before = await countIncomes(mine.householdId);

    const badSource = await createIncome(db, ctx(), {
      ...base(),
      incomeSourceId: other.fixedSourceId,
    });
    assert.deepEqual(badSource, { ok: false, error: "source_not_found" });

    const badAccount = await createIncome(db, ctx(), {
      ...base(),
      accountId: other.accountId,
    });
    assert.deepEqual(badAccount, { ok: false, error: "account_not_found" });

    assert.equal(await countIncomes(mine.householdId), before);
    assert.equal(await countIncomes(other.householdId), 0);
  });

  it("rejects a related expense from another household and inserts nothing", async () => {
    const foreignExpense = await insertExpense(other, other.reimbursableItemId, 50_000, 70);
    const before = await countIncomes(mine.householdId);

    const result = await createIncome(db, ctx(), {
      ...base(),
      incomeSourceId: mine.reimbursementSourceId,
      relatedExpenseId: foreignExpense,
    });
    assert.deepEqual(result, { ok: false, error: "expense_not_found" });
    assert.equal(await countIncomes(mine.householdId), before);
  });

  it("rejects a related expense when the source is not a reimbursement", async () => {
    const expenseId = await insertExpense(mine, mine.reimbursableItemId, 80_000, 70);
    const before = await countIncomes(mine.householdId);

    const result = await createIncome(db, ctx(), {
      ...base(),
      incomeSourceId: mine.fixedSourceId,
      relatedExpenseId: expenseId,
    });
    assert.deepEqual(result, { ok: false, error: "source_not_reimbursement" });
    assert.equal(await countIncomes(mine.householdId), before);
  });

  it("rejects a related expense that is not reimbursable", async () => {
    const expenseId = await insertExpense(mine, mine.plainItemId, 20_000, null);
    const before = await countIncomes(mine.householdId);

    const result = await createIncome(db, ctx(), {
      ...base(),
      incomeSourceId: mine.reimbursementSourceId,
      relatedExpenseId: expenseId,
    });
    assert.deepEqual(result, { ok: false, error: "expense_not_reimbursable" });
    assert.equal(await countIncomes(mine.householdId), before);
  });

  it("lists the incomes of a month for the household only, newest first", async () => {
    const seed = await seedHousehold("list");
    const listCtx = { householdId: seed.householdId, userId: seed.userId };
    const input = {
      incomeSourceId: seed.fixedSourceId,
      accountId: seed.accountId,
      budgetMonth: "2026-10-01",
      relatedExpenseId: null,
    };
    await createIncome(db, listCtx, { ...input, amount: 900, receivedOn: "2026-10-03" });
    await createIncome(db, listCtx, { ...input, amount: 1200, receivedOn: "2026-10-20" });
    await createIncome(db, listCtx, {
      ...input,
      amount: 555,
      receivedOn: "2026-11-02",
      budgetMonth: "2026-11-01",
    });
    await createIncome(
      db,
      { householdId: other.householdId, userId: other.userId },
      {
        incomeSourceId: other.fixedSourceId,
        accountId: other.accountId,
        amount: 777,
        receivedOn: "2026-10-10",
        budgetMonth: "2026-10-01",
        relatedExpenseId: null,
      },
    );

    const rows = await listIncomes(db, seed.householdId, "2026-10-01");
    assert.deepEqual(
      rows.map((r) => r.amount),
      [1200, 900],
    );
    assert.equal(rows[0].sourceName, "Salary (me)");
    assert.equal(rows[0].accountName, "Salary");
  });

  it("lists the income sources of the household only, with the default account", async () => {
    const sources = await listIncomeSources(db, mine.householdId);
    assert.deepEqual(sources.map((s) => s.id).sort(), [
      mine.fixedSourceId,
      mine.reimbursementSourceId,
    ].sort());
    const reimbursement = sources.find((s) => s.id === mine.reimbursementSourceId);
    assert.equal(reimbursement?.kind, "reimbursement");
    assert.equal(reimbursement?.defaultAccountId, mine.accountId);
  });

  it("lists pending reimbursements across months with what is still owed", async () => {
    const seed = await seedHousehold("pending");
    const pendingCtx = { householdId: seed.householdId, userId: seed.userId };

    const untouched = await insertExpense(seed, seed.reimbursableItemId, 100_000, 70, "2026-08-10");
    const partial = await insertExpense(seed, seed.reimbursableItemId, 200_000, 50, "2026-09-10");
    const settled = await insertExpense(seed, seed.reimbursableItemId, 10_000, 100, "2026-09-12");
    const overpaid = await insertExpense(seed, seed.reimbursableItemId, 10_000, 100, "2026-09-14");
    await insertExpense(seed, seed.plainItemId, 40_000, null, "2026-09-15");

    const pay = (relatedExpenseId: string, amount: number) =>
      createIncome(db, pendingCtx, {
        incomeSourceId: seed.reimbursementSourceId,
        accountId: seed.accountId,
        amount,
        receivedOn: "2026-10-28",
        budgetMonth: "2026-10-01",
        relatedExpenseId,
      });
    await pay(partial, 30_000);
    await pay(partial, 20_000);
    await pay(settled, 10_000);
    await pay(overpaid, 12_000);

    const pending = await listPendingReimbursements(db, seed.householdId);
    assert.deepEqual(
      pending.map((p) => ({
        id: p.id,
        expected: p.expected,
        received: p.received,
        pending: p.pending,
      })),
      [
        { id: untouched, expected: 70_000, received: 0, pending: 70_000 },
        { id: partial, expected: 100_000, received: 50_000, pending: 50_000 },
      ],
    );
    assert.equal(pending[0].itemName, "Doctor");
    assert.equal(pending[0].categoryName, "Health");

    const foreign = await listPendingReimbursements(db, other.householdId);
    assert.ok(foreign.every((p) => p.id !== untouched && p.id !== partial));
  });
});
