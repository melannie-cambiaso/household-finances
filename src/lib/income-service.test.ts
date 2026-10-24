import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import {
  createIncome,
  deleteIncome,
  getIncome,
  listIncomes,
  listIncomeSources,
  listPendingReimbursements,
  updateIncome,
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

  describe("edit and delete", () => {
    // Each test builds its own households, so none depends on another.
    const ctxOf = (seed: Seed) => ({
      householdId: seed.householdId,
      userId: seed.userId,
    });
    const inputOf = (seed: Seed) => ({
      incomeSourceId: seed.fixedSourceId,
      accountId: seed.accountId,
      amount: 1_500_000,
      receivedOn: "2026-10-28",
      budgetMonth: "2026-10-01",
      relatedExpenseId: null as string | null,
    });

    async function makeIncome(seed: Seed, overrides: Partial<ReturnType<typeof inputOf>> = {}) {
      const result = await createIncome(db, ctxOf(seed), { ...inputOf(seed), ...overrides });
      assert.equal(result.ok, true);
      return result.ok ? result.id : "";
    }

    async function rowOf(id: string) {
      const [row] = await db
        .select()
        .from(schema.incomes)
        .where(eq(schema.incomes.id, id));
      return row;
    }

    async function secondAccount(seed: Seed) {
      const [account] = await db
        .insert(schema.accounts)
        .values({ householdId: seed.householdId, name: "Savings", kind: "savings" })
        .returning();
      return account.id;
    }

    it("gets an income of the household and nothing else", async () => {
      const seed = await seedHousehold("inc-get-mine");
      const otherSeed = await seedHousehold("inc-get-other");
      const id = await makeIncome(seed);
      const foreign = await makeIncome(otherSeed);

      const found = await getIncome(db, seed.householdId, id);
      assert.equal(found?.amount, 1_500_000);
      assert.equal(found?.incomeSourceId, seed.fixedSourceId);
      assert.equal(found?.relatedExpenseId, null);

      assert.equal(await getIncome(db, seed.householdId, foreign), null);
      assert.equal(await getIncome(db, seed.householdId, randomUUID()), null);
    });

    it("updates the fields and keeps the author", async () => {
      const seed = await seedHousehold("inc-update");
      const id = await makeIncome(seed);
      const account2 = await secondAccount(seed);

      const result = await updateIncome(db, ctxOf(seed), id, {
        ...inputOf(seed),
        incomeSourceId: seed.reimbursementSourceId,
        accountId: account2,
        amount: 42_000,
        receivedOn: "2026-11-03",
        budgetMonth: "2026-11-01",
      });
      assert.deepEqual(result, { ok: true });

      const row = await rowOf(id);
      assert.equal(row.incomeSourceId, seed.reimbursementSourceId);
      assert.equal(row.accountId, account2);
      assert.equal(row.amount, 42_000);
      assert.equal(row.receivedOn, "2026-11-03");
      assert.equal(row.budgetMonth, "2026-11-01");
      assert.equal(row.createdBy, seed.userId);
    });

    it("links a reimbursement to an expense and unlinks it again", async () => {
      const seed = await seedHousehold("inc-link");
      const expenseId = await insertExpense(seed, seed.reimbursableItemId, 100_000, 70);
      const id = await makeIncome(seed, { incomeSourceId: seed.reimbursementSourceId, amount: 30_000 });

      assert.deepEqual(
        await updateIncome(db, ctxOf(seed), id, {
          ...inputOf(seed),
          incomeSourceId: seed.reimbursementSourceId,
          amount: 30_000,
          relatedExpenseId: expenseId,
        }),
        { ok: true },
      );
      assert.equal((await rowOf(id)).relatedExpenseId, expenseId);
      const linked = await listPendingReimbursements(db, seed.householdId);
      assert.equal(linked[0].pending, 40_000, "the link lowers what is pending");

      assert.deepEqual(
        await updateIncome(db, ctxOf(seed), id, {
          ...inputOf(seed),
          incomeSourceId: seed.reimbursementSourceId,
          amount: 30_000,
          relatedExpenseId: null,
        }),
        { ok: true },
      );
      assert.equal((await rowOf(id)).relatedExpenseId, null);
      const unlinked = await listPendingReimbursements(db, seed.householdId);
      assert.equal(unlinked[0].pending, 70_000, "unlinking restores it");
    });

    it("applies the creation rules to an edit and changes nothing when it refuses", async () => {
      const seed = await seedHousehold("inc-rules");
      const otherSeed = await seedHousehold("inc-rules-other");
      const id = await makeIncome(seed);
      const reimbursable = await insertExpense(seed, seed.reimbursableItemId, 80_000, 70);
      const plain = await insertExpense(seed, seed.plainItemId, 20_000, null);
      const foreignExpense = await insertExpense(otherSeed, otherSeed.reimbursableItemId, 50_000, 70);

      const cases: [string, Partial<ReturnType<typeof inputOf>>, string][] = [
        ["source of another household", { incomeSourceId: otherSeed.fixedSourceId }, "source_not_found"],
        ["account of another household", { accountId: otherSeed.accountId }, "account_not_found"],
        [
          "expense of another household",
          { incomeSourceId: seed.reimbursementSourceId, relatedExpenseId: foreignExpense },
          "expense_not_found",
        ],
        [
          "a non-reimbursement source linked to an expense",
          { relatedExpenseId: reimbursable },
          "source_not_reimbursement",
        ],
        [
          "a non-reimbursable expense",
          { incomeSourceId: seed.reimbursementSourceId, relatedExpenseId: plain },
          "expense_not_reimbursable",
        ],
      ];
      for (const [label, overrides, error] of cases) {
        const result = await updateIncome(db, ctxOf(seed), id, {
          ...inputOf(seed),
          amount: 1,
          ...overrides,
        });
        assert.deepEqual(result, { ok: false, error }, label);
      }

      const row = await rowOf(id);
      assert.equal(row.amount, 1_500_000);
      assert.equal(row.incomeSourceId, seed.fixedSourceId);
      assert.equal(row.relatedExpenseId, null);
    });

    it("cannot update an income of another household", async () => {
      const seed = await seedHousehold("inc-upd-attacker");
      const victim = await seedHousehold("inc-upd-victim");
      const id = await makeIncome(victim);

      const result = await updateIncome(db, ctxOf(seed), id, { ...inputOf(seed), amount: 1 });
      assert.deepEqual(result, { ok: false, error: "income_not_found" });
      assert.equal((await rowOf(id)).amount, 1_500_000);

      const missing = await updateIncome(db, ctxOf(seed), randomUUID(), inputOf(seed));
      assert.deepEqual(missing, { ok: false, error: "income_not_found" });
    });

    it("deletes an income, and the expense it covered is pending again", async () => {
      const seed = await seedHousehold("inc-delete");
      const expenseId = await insertExpense(seed, seed.reimbursableItemId, 100_000, 70);
      const id = await makeIncome(seed, {
        incomeSourceId: seed.reimbursementSourceId,
        amount: 70_000,
        relatedExpenseId: expenseId,
      });
      const keep = await makeIncome(seed);
      assert.deepEqual(await listPendingReimbursements(db, seed.householdId), []);

      assert.deepEqual(await deleteIncome(db, seed.householdId, id), { ok: true });

      assert.equal(await getIncome(db, seed.householdId, id), null);
      assert.ok(await getIncome(db, seed.householdId, keep), "other incomes are untouched");
      const pending = await listPendingReimbursements(db, seed.householdId);
      assert.deepEqual(
        pending.map((p) => [p.id, p.pending]),
        [[expenseId, 70_000]],
      );
    });

    it("cannot delete an income of another household or one that does not exist", async () => {
      const seed = await seedHousehold("inc-del-attacker");
      const victim = await seedHousehold("inc-del-victim");
      const id = await makeIncome(victim);

      assert.deepEqual(await deleteIncome(db, seed.householdId, id), {
        ok: false,
        error: "income_not_found",
      });
      assert.deepEqual(await deleteIncome(db, seed.householdId, randomUUID()), {
        ok: false,
        error: "income_not_found",
      });
      assert.ok(await getIncome(db, victim.householdId, id), "the victim's income survives");
    });
  });
});
