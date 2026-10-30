import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import { getAccountNets } from "./account-nets-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

const OCTOBER = "2026-10-01";

describe("account nets service", { skip: !url }, () => {
  const sql = postgres(url ?? "postgres://unused", { prepare: false });
  const db = drizzle(sql, { schema });

  const householdIds: string[] = [];

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
      .values({ categoryId: category.id, name: "Misc", reimbursementPct: null })
      .returning();
    const salaryId = await account("Salary", "salary");
    const savingsId = await account("Savings", "savings");
    const utilitiesId = await account("Utilities", "utilities");
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
      utilitiesId,
    };
  }
  type Seed = Awaited<ReturnType<typeof seedHousehold>>;

  async function spend(
    seed: Seed,
    accountId: string,
    amount: number,
    spentOn: string,
    budgetMonth = `${spentOn.slice(0, 7)}-01`,
  ) {
    await db.insert(schema.expenses).values({
      householdId: seed.householdId,
      itemId: seed.itemId,
      accountId,
      budgetMonth,
      spentOn,
      amount,
      createdBy: seed.userId,
    });
  }

  async function receive(
    seed: Seed,
    accountId: string,
    amount: number,
    receivedOn: string,
    budgetMonth = `${receivedOn.slice(0, 7)}-01`,
  ) {
    await db.insert(schema.incomes).values({
      householdId: seed.householdId,
      incomeSourceId: seed.sourceId,
      accountId,
      budgetMonth,
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
  ) {
    await db.insert(schema.transfers).values({
      householdId: seed.householdId,
      fromAccountId,
      toAccountId,
      amount,
      madeOn,
      kind: "other",
    });
  }

  const byName = (nets: Awaited<ReturnType<typeof getAccountNets>>, name: string) => {
    const net = nets.find((n) => n.name === name);
    assert.ok(net, `no account named ${name}`);
    return net;
  };

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

  it("returns the salary and utilities accounts, never savings, with a zero net when nothing moved", async () => {
    const seed = await seedHousehold("empty");
    const nets = await getAccountNets(db, seed.householdId, OCTOBER);
    assert.deepEqual(
      nets.map((n) => [n.name, n.kind, n.net]),
      [
        ["Salary", "salary", 0],
        ["Utilities", "utilities", 0],
      ],
    );
  });

  it("nets incomes, transfers and expenses of the month per account", async () => {
    const seed = await seedHousehold("flows");
    await receive(seed, seed.salaryId, 1_000_000, "2026-10-05");
    await spend(seed, seed.salaryId, 150_000, "2026-10-10");
    await transfer(seed, seed.salaryId, seed.utilitiesId, 200_000, "2026-10-06");
    await spend(seed, seed.utilitiesId, 80_000, "2026-10-12");
    await spend(seed, seed.savingsId, 270_000, "2026-10-15");

    const nets = await getAccountNets(db, seed.householdId, OCTOBER);
    assert.deepEqual(byName(nets, "Salary"), {
      id: seed.salaryId,
      name: "Salary",
      kind: "salary",
      incomes: 1_000_000,
      transfersIn: 0,
      transfersOut: 200_000,
      expenses: 150_000,
      net: 650_000,
    });
    assert.equal(byName(nets, "Utilities").net, 120_000);
    assert.equal(nets.some((n) => n.kind === "savings"), false);
  });

  it("counts incomes and expenses by their budget month, not the day they happened", async () => {
    const seed = await seedHousehold("budget-month");
    // Received in October but counted toward November.
    await receive(seed, seed.salaryId, 2_000_000, "2026-10-30", "2026-11-01");
    // Paid in November but counted toward October.
    await spend(seed, seed.salaryId, 300_000, "2026-11-02", "2026-10-01");

    const october = byName(await getAccountNets(db, seed.householdId, OCTOBER), "Salary");
    assert.equal(october.incomes, 0);
    assert.equal(october.expenses, 300_000);

    const november = byName(await getAccountNets(db, seed.householdId, "2026-11-01"), "Salary");
    assert.equal(november.incomes, 2_000_000);
    assert.equal(november.expenses, 0);
  });

  it("counts transfers by the day they were made, edges included", async () => {
    const seed = await seedHousehold("edges");
    await transfer(seed, seed.salaryId, seed.utilitiesId, 1, "2026-09-30");
    await transfer(seed, seed.salaryId, seed.utilitiesId, 10, "2026-10-01");
    await transfer(seed, seed.salaryId, seed.utilitiesId, 100, "2026-10-31");
    await transfer(seed, seed.salaryId, seed.utilitiesId, 1_000, "2026-11-01");

    const nets = await getAccountNets(db, seed.householdId, OCTOBER);
    assert.equal(byName(nets, "Salary").net, -110);
    assert.equal(byName(nets, "Utilities").net, 110);
  });

  it("ignores the movements of other households", async () => {
    const mine = await seedHousehold("mine");
    const other = await seedHousehold("other");
    await receive(other, other.salaryId, 999, "2026-10-05");

    const nets = await getAccountNets(db, mine.householdId, OCTOBER);
    assert.equal(nets.length, 2);
    assert.ok(nets.every((n) => n.net === 0));
  });
});
