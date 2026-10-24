import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import { getSavingsOverview, setOpeningBalance } from "./savings-service.ts";
import { getSavingsDebt } from "./transfer-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

const TODAY = "2026-10-24";
const OCTOBER = "2026-10-01";
const OPENING = { amount: 1_000_000, on: "2026-09-30" };

describe("savings service", { skip: !url }, () => {
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
    const [user] = await db
      .insert(schema.users)
      .values({
        householdId: household.id,
        name: label,
        email: `${label}-${randomUUID()}@test.invalid`,
      })
      .returning();
    const [category] = await db
      .insert(schema.categories)
      .values({ householdId: household.id, name: "Extras" })
      .returning();
    const [item] = await db
      .insert(schema.items)
      .values({ categoryId: category.id, name: "Juntos", reimbursementPct: null })
      .returning();
    const salaryId = await account("Salary", "salary");
    const savingsId = await account("Savings", "savings");
    const [source] = await db
      .insert(schema.incomeSources)
      .values({
        householdId: household.id,
        name: "Bonus",
        kind: "fixed",
        defaultAmount: null,
        defaultAccountId: salaryId,
      })
      .returning();
    return {
      householdId: household.id,
      userId: user.id,
      itemId: item.id,
      sourceId: source.id,
      salaryId,
      savingsId,
      account,
    };
  }
  type Seed = Awaited<ReturnType<typeof seedHousehold>>;

  async function spend(
    seed: Seed,
    accountId: string,
    amount: number,
    spentOn: string,
    description: string | null = null,
  ) {
    await db.insert(schema.expenses).values({
      householdId: seed.householdId,
      itemId: seed.itemId,
      accountId,
      budgetMonth: `${spentOn.slice(0, 7)}-01`,
      spentOn,
      amount,
      description,
      createdBy: seed.userId,
    });
  }

  async function receive(seed: Seed, accountId: string, amount: number, receivedOn: string) {
    await db.insert(schema.incomes).values({
      householdId: seed.householdId,
      incomeSourceId: seed.sourceId,
      accountId,
      budgetMonth: `${receivedOn.slice(0, 7)}-01`,
      receivedOn,
      amount,
      createdBy: seed.userId,
    });
  }

  async function transfer(
    seed: Seed,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    madeOn: string,
    kind: "repayment" | "funding" | "other" = "other",
  ) {
    await db
      .insert(schema.transfers)
      .values({ householdId: seed.householdId, fromAccountId, toAccountId, amount, madeOn, kind });
  }

  async function accountRow(id: string) {
    const [row] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id));
    return row;
  }

  async function overviewOf(seed: Seed, month = OCTOBER) {
    return getSavingsOverview(db, seed.householdId, month, TODAY);
  }

  after(async () => {
    await db.delete(schema.incomes).where(inArray(schema.incomes.householdId, householdIds));
    await db.delete(schema.transfers).where(inArray(schema.transfers.householdId, householdIds));
    await db.delete(schema.expenses).where(inArray(schema.expenses.householdId, householdIds));
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
        await db.delete(schema.items).where(inArray(schema.items.categoryId, categoryIds));
      }
      await db.delete(schema.categories).where(eq(schema.categories.householdId, householdId));
    }
    await db.delete(schema.users).where(inArray(schema.users.householdId, householdIds));
    await db.delete(schema.accounts).where(inArray(schema.accounts.householdId, householdIds));
    await db.delete(schema.households).where(inArray(schema.households.id, householdIds));
    await sql.end();
  });

  describe("setOpeningBalance", () => {
    it("stores the amount and date on a savings account", async () => {
      const seed = await seedHousehold("open-store");
      const result = await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      assert.deepEqual(result, { ok: true });

      const row = await accountRow(seed.savingsId);
      assert.equal(row.openingBalance, 1_000_000);
      assert.equal(row.openingBalanceOn, "2026-09-30");
    });

    it("replaces an earlier opening balance", async () => {
      const seed = await seedHousehold("open-replace");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await setOpeningBalance(db, seed.householdId, seed.savingsId, { amount: 0, on: "2026-10-01" });

      const row = await accountRow(seed.savingsId);
      assert.equal(row.openingBalance, 0);
      assert.equal(row.openingBalanceOn, "2026-10-01");
    });

    it("refuses an account that is not a savings account and stores nothing", async () => {
      const seed = await seedHousehold("open-kind");
      const result = await setOpeningBalance(db, seed.householdId, seed.salaryId, OPENING);
      assert.deepEqual(result, { ok: false, error: "not_savings_account" });

      const row = await accountRow(seed.salaryId);
      assert.equal(row.openingBalance, null);
      assert.equal(row.openingBalanceOn, null);
    });

    it("refuses an account of another household and leaves it untouched", async () => {
      const mine = await seedHousehold("open-mine");
      const other = await seedHousehold("open-other");
      const result = await setOpeningBalance(db, mine.householdId, other.savingsId, OPENING);
      assert.deepEqual(result, { ok: false, error: "account_not_found" });

      const row = await accountRow(other.savingsId);
      assert.equal(row.openingBalance, null);
      assert.equal(row.openingBalanceOn, null);
    });

    it("refuses an account that does not exist", async () => {
      const seed = await seedHousehold("open-missing");
      const result = await setOpeningBalance(db, seed.householdId, randomUUID(), OPENING);
      assert.deepEqual(result, { ok: false, error: "account_not_found" });
    });
  });

  describe("getSavingsOverview", () => {
    it("lists only savings accounts and has no balance until one is set", async () => {
      const seed = await seedHousehold("ov-unset");
      await spend(seed, seed.savingsId, 5_000, "2026-10-05");

      const overview = await overviewOf(seed);
      assert.equal(overview.accounts.length, 1);
      assert.equal(overview.accounts[0].id, seed.savingsId);
      assert.equal(overview.accounts[0].name, "Savings");
      assert.equal(overview.accounts[0].opening, null);
      assert.equal(overview.accounts[0].balance, null);
      assert.equal(overview.accounts[0].statement, null);
      assert.equal(overview.total, null);
    });

    it("adds incomes and transfers in, and takes expenses and transfers out", async () => {
      const seed = await seedHousehold("ov-balance");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await spend(seed, seed.savingsId, 270_000, "2026-10-20");
      await receive(seed, seed.savingsId, 50_000, "2026-10-10");
      await transfer(seed, seed.salaryId, seed.savingsId, 100_000, "2026-10-12", "repayment");
      await transfer(seed, seed.savingsId, seed.salaryId, 30_000, "2026-10-15");

      const overview = await overviewOf(seed);
      // 1.000.000 - 270.000 + 50.000 + 100.000 - 30.000
      assert.equal(overview.accounts[0].balance, 850_000);
      assert.equal(overview.total, 850_000);
    });

    it("counts the movements made on the opening date", async () => {
      const seed = await seedHousehold("ov-openday");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await spend(seed, seed.savingsId, 5_000, "2026-09-30");
      await receive(seed, seed.savingsId, 2_000, "2026-09-30");

      const overview = await overviewOf(seed);
      assert.equal(overview.accounts[0].balance, 997_000);
    });

    it("ignores movements before the opening date and the other accounts", async () => {
      const seed = await seedHousehold("ov-scope");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await spend(seed, seed.savingsId, 999, "2026-09-29");
      await spend(seed, seed.savingsId, 999, "2026-09-02");
      await spend(seed, seed.salaryId, 888, "2026-10-05");
      await receive(seed, seed.salaryId, 777, "2026-10-06");
      const utilitiesId = await seed.account("Utilities", "utilities");
      await transfer(seed, seed.salaryId, utilitiesId, 200_000, "2026-10-07", "funding");

      const overview = await overviewOf(seed);
      assert.equal(overview.accounts[0].balance, 1_000_000);
    });

    it("does not count movements dated after today", async () => {
      const seed = await seedHousehold("ov-future");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await spend(seed, seed.savingsId, 100_000, "2026-10-30");

      const overview = await overviewOf(seed);
      assert.equal(overview.accounts[0].balance, 1_000_000);
    });

    it("shows the month's statement with signed rows, labels and balances", async () => {
      const seed = await seedHousehold("ov-statement");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await spend(seed, seed.savingsId, 270_000, "2026-10-20", "phone");
      await receive(seed, seed.savingsId, 50_000, "2026-10-10");
      await transfer(seed, seed.salaryId, seed.savingsId, 100_000, "2026-10-12", "repayment");
      await spend(seed, seed.savingsId, 40_000, "2026-09-15");

      const statement = (await overviewOf(seed)).accounts[0].statement;
      assert.ok(statement);
      assert.equal(statement.startBalance, 1_000_000);
      assert.equal(statement.endBalance, 880_000);
      assert.deepEqual(
        statement.rows.map((r) => [r.date, r.kind, r.amount, r.label, r.balance]),
        [
          ["2026-10-20", "expense", -270_000, "Juntos (Extras) · phone", 880_000],
          ["2026-10-12", "transfer_in", 100_000, "From Salary", 1_150_000],
          ["2026-10-10", "income", 50_000, "Bonus", 1_050_000],
        ],
      );
    });

    it("carries the earlier months into the starting balance of a later month", async () => {
      const seed = await seedHousehold("ov-carry");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await spend(seed, seed.savingsId, 200_000, "2026-10-20");
      await spend(seed, seed.savingsId, 10_000, "2026-11-03");

      const statement = (await overviewOf(seed, "2026-11-01")).accounts[0].statement;
      assert.ok(statement);
      assert.equal(statement.startBalance, 800_000);
      assert.equal(statement.endBalance, 790_000);
      assert.equal(statement.rows.length, 1);
    });

    it("sums several savings accounts and a transfer between them changes nothing", async () => {
      const seed = await seedHousehold("ov-two");
      const second = await seed.account("Trip fund", "savings");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await setOpeningBalance(db, seed.householdId, second, { amount: 500_000, on: "2026-09-30" });
      await transfer(seed, seed.savingsId, second, 200_000, "2026-10-08");

      const overview = await overviewOf(seed);
      assert.equal(overview.accounts.length, 2);
      const byId = new Map(overview.accounts.map((a) => [a.id, a.balance]));
      assert.equal(byId.get(seed.savingsId), 800_000);
      assert.equal(byId.get(second), 700_000);
      assert.equal(overview.total, 1_500_000);
    });

    it("totals only the accounts that have an opening balance", async () => {
      const seed = await seedHousehold("ov-partial");
      await seed.account("Trip fund", "savings");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);

      const overview = await overviewOf(seed);
      assert.equal(overview.accounts.length, 2);
      assert.equal(overview.total, 1_000_000);
    });

    it("never shows another household's accounts or movements", async () => {
      const mine = await seedHousehold("ov-iso-mine");
      const other = await seedHousehold("ov-iso-other");
      await setOpeningBalance(db, mine.householdId, mine.savingsId, OPENING);
      await setOpeningBalance(db, other.householdId, other.savingsId, OPENING);
      await spend(other, other.savingsId, 500_000, "2026-10-05");

      const overview = await overviewOf(mine);
      assert.equal(overview.accounts.length, 1);
      assert.equal(overview.accounts[0].id, mine.savingsId);
      assert.equal(overview.accounts[0].balance, 1_000_000);
    });

    it("leaves the savings debt untouched", async () => {
      const seed = await seedHousehold("ov-debt");
      await setOpeningBalance(db, seed.householdId, seed.savingsId, OPENING);
      await spend(seed, seed.savingsId, 270_000, "2026-10-20");
      await transfer(seed, seed.salaryId, seed.savingsId, 100_000, "2026-10-12", "repayment");

      const before = await getSavingsDebt(db, seed.householdId);
      await overviewOf(seed);
      assert.equal(before, 170_000);
      assert.equal(await getSavingsDebt(db, seed.householdId), 170_000);
    });
  });
});
