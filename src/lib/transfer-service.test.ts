import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import type { TransferInput } from "./transfers.ts";
import {
  createTransfer,
  deleteTransfer,
  getSavingsDebt,
  getSavingsNetEffect,
  getTransfer,
  listTransfers,
  updateTransfer,
} from "./transfer-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

describe("transfer service", { skip: !url }, () => {
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
    const account = async (name: string, kind: "salary" | "savings" | "utilities") =>
      (
        await db
          .insert(schema.accounts)
          .values({ householdId: household.id, name, kind })
          .returning()
      )[0].id;
    return {
      householdId: household.id,
      salaryId: await account("Salary", "salary"),
      savingsId: await account("Savings", "savings"),
      utilitiesId: await account("Utilities", "utilities"),
    };
  }
  type Seed = Awaited<ReturnType<typeof seedHousehold>>;

  // Typed as a full TransferInput so a test can override the kind.
  const funding = (seed: Seed): TransferInput => ({
    fromAccountId: seed.salaryId,
    toAccountId: seed.utilitiesId,
    amount: 200_000,
    madeOn: "2026-10-05",
    kind: "funding",
  });

  async function rowOf(id: string) {
    const [row] = await db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, id));
    return row;
  }

  async function countOf(householdId: string) {
    const rows = await db
      .select({ id: schema.transfers.id })
      .from(schema.transfers)
      .where(eq(schema.transfers.householdId, householdId));
    return rows.length;
  }

  async function make(seed: Seed, overrides: Partial<ReturnType<typeof funding>> = {}) {
    const result = await createTransfer(db, seed.householdId, { ...funding(seed), ...overrides });
    assert.equal(result.ok, true);
    return result.ok ? result.id : "";
  }

  after(async () => {
    await db
      .delete(schema.transfers)
      .where(inArray(schema.transfers.householdId, householdIds));
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
      .delete(schema.users)
      .where(inArray(schema.users.householdId, householdIds));
    await db
      .delete(schema.accounts)
      .where(inArray(schema.accounts.householdId, householdIds));
    await db
      .delete(schema.households)
      .where(inArray(schema.households.id, householdIds));
    await sql.end();
  });

  it("creates a funding transfer between two accounts of the household", async () => {
    const seed = await seedHousehold("create");
    const result = await createTransfer(db, seed.householdId, funding(seed));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const row = await rowOf(result.id);
    assert.equal(row.householdId, seed.householdId);
    assert.equal(row.fromAccountId, seed.salaryId);
    assert.equal(row.toAccountId, seed.utilitiesId);
    assert.equal(row.amount, 200_000);
    assert.equal(row.madeOn, "2026-10-05");
    assert.equal(row.kind, "funding");
  });

  it("accepts a repayment into a savings account and refuses it anywhere else", async () => {
    const seed = await seedHousehold("repay");
    const ok = await createTransfer(db, seed.householdId, {
      ...funding(seed),
      toAccountId: seed.savingsId,
      kind: "repayment",
    });
    assert.equal(ok.ok, true);

    const before = await countOf(seed.householdId);
    const bad = await createTransfer(db, seed.householdId, {
      ...funding(seed),
      toAccountId: seed.utilitiesId,
      kind: "repayment",
    });
    assert.deepEqual(bad, { ok: false, error: "repayment_must_go_to_savings" });
    assert.equal(await countOf(seed.householdId), before);
  });

  it("allows other kinds to go into a savings account", async () => {
    const seed = await seedHousehold("kinds");
    for (const kind of ["funding", "other"] as const) {
      const result = await createTransfer(db, seed.householdId, {
        ...funding(seed),
        toAccountId: seed.savingsId,
        kind,
      });
      assert.equal(result.ok, true, kind);
    }
  });

  it("refuses an account from another household and inserts nothing", async () => {
    const seed = await seedHousehold("acc-mine");
    const other = await seedHousehold("acc-other");

    const badFrom = await createTransfer(db, seed.householdId, {
      ...funding(seed),
      fromAccountId: other.salaryId,
    });
    assert.deepEqual(badFrom, { ok: false, error: "account_not_found" });

    const badTo = await createTransfer(db, seed.householdId, {
      ...funding(seed),
      toAccountId: other.utilitiesId,
    });
    assert.deepEqual(badTo, { ok: false, error: "account_not_found" });

    assert.equal(await countOf(seed.householdId), 0);
    assert.equal(await countOf(other.householdId), 0);
  });

  it("gets a transfer of the household and nothing else", async () => {
    const seed = await seedHousehold("get-mine");
    const other = await seedHousehold("get-other");
    const id = await make(seed);
    const foreign = await make(other);

    const found = await getTransfer(db, seed.householdId, id);
    assert.equal(found?.amount, 200_000);
    assert.equal(found?.kind, "funding");

    assert.equal(await getTransfer(db, seed.householdId, foreign), null);
    assert.equal(await getTransfer(db, seed.householdId, randomUUID()), null);
  });

  it("updates a transfer", async () => {
    const seed = await seedHousehold("update");
    const id = await make(seed);

    const result = await updateTransfer(db, seed.householdId, id, {
      fromAccountId: seed.savingsId,
      toAccountId: seed.salaryId,
      amount: 5_000,
      madeOn: "2026-11-02",
      kind: "other",
    });
    assert.deepEqual(result, { ok: true });

    const row = await rowOf(id);
    assert.equal(row.fromAccountId, seed.savingsId);
    assert.equal(row.toAccountId, seed.salaryId);
    assert.equal(row.amount, 5_000);
    assert.equal(row.madeOn, "2026-11-02");
    assert.equal(row.kind, "other");
  });

  it("applies the creation rules to an edit and changes nothing when it refuses", async () => {
    const seed = await seedHousehold("upd-rules");
    const other = await seedHousehold("upd-rules-other");
    const id = await make(seed);

    const notSavings = await updateTransfer(db, seed.householdId, id, {
      ...funding(seed),
      kind: "repayment", // goes to Utilities, which is not savings
    });
    assert.deepEqual(notSavings, { ok: false, error: "repayment_must_go_to_savings" });

    const foreignAccount = await updateTransfer(db, seed.householdId, id, {
      ...funding(seed),
      toAccountId: other.utilitiesId,
    });
    assert.deepEqual(foreignAccount, { ok: false, error: "account_not_found" });

    const row = await rowOf(id);
    assert.equal(row.kind, "funding");
    assert.equal(row.toAccountId, seed.utilitiesId);
    assert.equal(row.amount, 200_000);
  });

  it("cannot update a transfer of another household", async () => {
    const seed = await seedHousehold("upd-attacker");
    const victim = await seedHousehold("upd-victim");
    const id = await make(victim);

    const result = await updateTransfer(db, seed.householdId, id, { ...funding(seed), amount: 1 });
    assert.deepEqual(result, { ok: false, error: "transfer_not_found" });
    assert.equal((await rowOf(id)).amount, 200_000);

    const missing = await updateTransfer(db, seed.householdId, randomUUID(), funding(seed));
    assert.deepEqual(missing, { ok: false, error: "transfer_not_found" });
  });

  it("deletes a transfer, and cannot delete one of another household", async () => {
    const seed = await seedHousehold("del-mine");
    const victim = await seedHousehold("del-victim");
    const id = await make(seed);
    const keep = await make(seed);
    const foreign = await make(victim);

    assert.deepEqual(await deleteTransfer(db, seed.householdId, id), { ok: true });
    assert.equal(await getTransfer(db, seed.householdId, id), null);
    assert.ok(await getTransfer(db, seed.householdId, keep), "other transfers are untouched");

    assert.deepEqual(await deleteTransfer(db, seed.householdId, foreign), {
      ok: false,
      error: "transfer_not_found",
    });
    assert.deepEqual(await deleteTransfer(db, seed.householdId, randomUUID()), {
      ok: false,
      error: "transfer_not_found",
    });
    assert.ok(await getTransfer(db, victim.householdId, foreign), "the victim's transfer survives");
  });

  it("lists the transfers of a calendar month, newest first, with account names", async () => {
    const seed = await seedHousehold("list");
    const other = await seedHousehold("list-other");
    await make(seed, { madeOn: "2026-09-30" }); // the day before: excluded
    const first = await make(seed, { madeOn: "2026-10-01", amount: 1 }); // first day: included
    const last = await make(seed, { madeOn: "2026-10-31", amount: 2 }); // last day: included
    await make(seed, { madeOn: "2026-11-01" }); // the day after: excluded
    await make(other, { madeOn: "2026-10-15" }); // another household: excluded

    const rows = await listTransfers(db, seed.householdId, "2026-10-01");
    assert.deepEqual(
      rows.map((r) => r.id),
      [last, first],
    );
    assert.equal(rows[0].fromName, "Salary");
    assert.equal(rows[0].toName, "Utilities");
    assert.equal(rows[0].kind, "funding");
  });

  describe("savings debt", () => {
    // Expenses need a user, a category and an item, on top of the accounts.
    async function seedDebt(label: string) {
      const seed = await seedHousehold(label);
      const [user] = await db
        .insert(schema.users)
        .values({
          householdId: seed.householdId,
          name: label,
          email: `${label}-${randomUUID()}@test.invalid`,
        })
        .returning();
      const [category] = await db
        .insert(schema.categories)
        .values({ householdId: seed.householdId, name: "Home" })
        .returning();
      const [item] = await db
        .insert(schema.items)
        .values({ categoryId: category.id, name: "Rent", reimbursementPct: null })
        .returning();
      return { ...seed, userId: user.id, itemId: item.id };
    }
    type DebtSeed = Awaited<ReturnType<typeof seedDebt>>;

    async function spend(seed: DebtSeed, accountId: string, amount: number, month = "2026-10-01") {
      await db.insert(schema.expenses).values({
        householdId: seed.householdId,
        itemId: seed.itemId,
        accountId,
        budgetMonth: month,
        spentOn: month,
        amount,
        createdBy: seed.userId,
      });
    }

    it("net effect: follows the money across the savings boundary, per month", async () => {
      const seed = await seedDebt("net-effect");
      await spend(seed, seed.savingsId, 100_000); // paid from savings
      await spend(seed, seed.salaryId, 30_000); // not from savings
      await make(seed, { fromAccountId: seed.savingsId, toAccountId: seed.salaryId, amount: 80_000 });
      await make(seed, { fromAccountId: seed.savingsId, toAccountId: seed.salaryId, kind: "other", amount: 9_000 });
      await make(seed, { fromAccountId: seed.salaryId, toAccountId: seed.savingsId, amount: 400_000 });
      await make(seed, { fromAccountId: seed.salaryId, toAccountId: seed.savingsId, kind: "repayment", amount: 20_000 });
      // Other month, between non-savings accounts, between savings accounts: ignored.
      await make(seed, { fromAccountId: seed.savingsId, toAccountId: seed.salaryId, amount: 5_000, madeOn: "2026-11-02" });
      await make(seed, { amount: 7_000 });
      await make(seed, { fromAccountId: seed.savingsId, toAccountId: seed.savingsId, amount: 11_000 });

      assert.deepEqual(await getSavingsNetEffect(db, seed.householdId, "2026-10-01"), {
        spentFromSavings: 100_000,
        movedOutOfSavings: 89_000,
        movedIntoSavings: 420_000,
      });
    });

    it("is zero when nothing was spent from savings", async () => {
      const seed = await seedDebt("debt-zero");
      assert.equal(await getSavingsDebt(db, seed.householdId), 0);

      await spend(seed, seed.salaryId, 500_000); // not from savings
      assert.equal(await getSavingsDebt(db, seed.householdId), 0);
    });

    it("is what was spent from savings, over any month", async () => {
      const seed = await seedDebt("debt-spent");
      await spend(seed, seed.savingsId, 100_000, "2026-01-01");
      await spend(seed, seed.savingsId, 50_000, "2026-10-01");
      await spend(seed, seed.salaryId, 999_000); // ignored
      assert.equal(await getSavingsDebt(db, seed.householdId), 150_000);
    });

    it("is reduced only by repayments into a savings account", async () => {
      const seed = await seedDebt("debt-repay");
      await spend(seed, seed.savingsId, 150_000);

      await make(seed, { toAccountId: seed.savingsId, kind: "repayment", amount: 40_000 });
      assert.equal(await getSavingsDebt(db, seed.householdId), 110_000);

      // Money moved into savings for another reason does not pay the debt.
      await make(seed, { toAccountId: seed.savingsId, kind: "funding", amount: 30_000 });
      await make(seed, { toAccountId: seed.savingsId, kind: "other", amount: 20_000 });
      assert.equal(await getSavingsDebt(db, seed.householdId), 110_000);

      // A repayment that does not end in savings reduces nothing. The service
      // refuses to create one, so it is inserted directly to test the query.
      await db.insert(schema.transfers).values({
        householdId: seed.householdId,
        fromAccountId: seed.salaryId,
        toAccountId: seed.utilitiesId,
        amount: 70_000,
        madeOn: "2026-10-05",
        kind: "repayment",
      });
      assert.equal(await getSavingsDebt(db, seed.householdId), 110_000);
    });

    it("is raised by funding transfers out of savings into another account", async () => {
      const seed = await seedDebt("debt-funding-out");
      await spend(seed, seed.savingsId, 100_000);

      await make(seed, { fromAccountId: seed.savingsId, toAccountId: seed.salaryId, kind: "funding", amount: 40_000 });
      assert.equal(await getSavingsDebt(db, seed.householdId), 140_000);

      // Other kinds out of savings do not make the household owe savings.
      await make(seed, { fromAccountId: seed.savingsId, toAccountId: seed.salaryId, kind: "other", amount: 15_000 });
      assert.equal(await getSavingsDebt(db, seed.householdId), 140_000);

      // A repayment back into savings pays it down.
      await make(seed, { toAccountId: seed.savingsId, kind: "repayment", amount: 90_000 });
      assert.equal(await getSavingsDebt(db, seed.householdId), 50_000);
    });

    it("goes negative when more was repaid than spent, and is derived, not stored", async () => {
      const seed = await seedDebt("debt-derived");
      await spend(seed, seed.savingsId, 100_000);
      const repayment = await make(seed, {
        toAccountId: seed.savingsId,
        kind: "repayment",
        amount: 130_000,
      });
      assert.equal(await getSavingsDebt(db, seed.householdId), -30_000);

      // Editing and deleting the repayment moves the debt: nothing is stored.
      await updateTransfer(db, seed.householdId, repayment, {
        ...funding(seed),
        toAccountId: seed.savingsId,
        kind: "repayment",
        amount: 25_000,
      });
      assert.equal(await getSavingsDebt(db, seed.householdId), 75_000);

      await deleteTransfer(db, seed.householdId, repayment);
      assert.equal(await getSavingsDebt(db, seed.householdId), 100_000);
    });

    it("ignores another household's expenses and repayments", async () => {
      const seed = await seedDebt("debt-mine");
      const other = await seedDebt("debt-other");
      await spend(seed, seed.savingsId, 60_000);
      await spend(other, other.savingsId, 900_000);
      await make(other, { toAccountId: other.savingsId, kind: "repayment", amount: 500_000 });

      assert.equal(await getSavingsDebt(db, seed.householdId), 60_000);
      assert.equal(await getSavingsDebt(db, other.householdId), 400_000);
    });
  });
});
