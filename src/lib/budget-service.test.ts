import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import { createBudgetMonth, getBudgetMonth } from "./budget-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

describe("budget service: create and read", { skip: !url }, () => {
  const sql = postgres(url ?? "postgres://unused", { prepare: false });
  const db = drizzle(sql, { schema });

  const householdIds: string[] = [];

  async function seedHousehold(label: string) {
    const [household] = await db
      .insert(schema.households)
      .values({ name: `test-${label}-${randomUUID()}` })
      .returning();
    householdIds.push(household.id);

    const [account] = await db
      .insert(schema.accounts)
      .values({ householdId: household.id, name: "Salary", kind: "salary" })
      .returning();
    const [category] = await db
      .insert(schema.categories)
      .values({ householdId: household.id, name: "Home" })
      .returning();
    const [rent] = await db
      .insert(schema.items)
      .values({ categoryId: category.id, name: "Rent", reimbursementPct: null })
      .returning();
    const [food] = await db
      .insert(schema.items)
      .values({ categoryId: category.id, name: "Food", reimbursementPct: null })
      .returning();
    const source = (name: string, kind: "fixed" | "per_friday" | "reimbursement", amount: number | null) =>
      db
        .insert(schema.incomeSources)
        .values({
          householdId: household.id,
          name,
          kind,
          defaultAmount: amount,
          defaultAccountId: account.id,
        })
        .returning()
        .then((rows) => rows[0]);
    const salary = await source("Salary", "fixed", 1_500_000);
    const friday = await source("Friday income", "per_friday", 50_000);
    const refund = await source("Refunds", "reimbursement", null);

    return {
      householdId: household.id,
      rentId: rent.id,
      foodId: food.id,
      salaryId: salary.id,
      fridayId: friday.id,
      refundId: refund.id,
    };
  }

  type Seed = Awaited<ReturnType<typeof seedHousehold>>;

  /** Inserts a budget month directly, to set up the previous month. */
  async function insertMonth(
    seed: Seed,
    month: string,
    lines: { itemId?: string; incomeSourceId?: string; plannedAmount: number }[],
    status: "draft" | "confirmed" = "confirmed",
  ) {
    const [row] = await db
      .insert(schema.budgetMonths)
      .values({
        householdId: seed.householdId,
        month,
        status,
        confirmedAt: status === "confirmed" ? new Date() : null,
      })
      .returning();
    if (lines.length > 0) {
      await db
        .insert(schema.budgetLines)
        .values(lines.map((line) => ({ budgetMonthId: row.id, ...line })));
    }
    return row.id;
  }

  const planned = (
    lines: { itemId: string | null; incomeSourceId: string | null; plannedAmount: number }[],
  ) =>
    lines
      .map((l) => [l.itemId ?? l.incomeSourceId, l.plannedAmount] as const)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

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
    }
    await db
      .delete(schema.households)
      .where(inArray(schema.households.id, householdIds));
    await sql.end();
  });

  it("creates an empty draft when there is no earlier budget", async () => {
    const seed = await seedHousehold("empty");
    const result = await createBudgetMonth(db, seed.householdId, "2026-10-01");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);

    const budget = await getBudgetMonth(db, seed.householdId, "2026-10-01");
    assert.equal(budget?.status, "draft");
    assert.equal(budget?.confirmedAt, null);
    assert.equal(budget?.copiedFromId, null);
    assert.deepEqual(budget?.lines, []);
  });

  it("copies the previous month as a draft and recomputes per-Friday income", async () => {
    const seed = await seedHousehold("copy");
    const previousId = await insertMonth(seed, "2026-10-01", [
      { itemId: seed.rentId, plannedAmount: 500_000 },
      { itemId: seed.foodId, plannedAmount: 0 },
      { incomeSourceId: seed.salaryId, plannedAmount: 1_500_000 },
      { incomeSourceId: seed.fridayId, plannedAmount: 250_000 }, // 5 Fridays in Oct 2026
      { incomeSourceId: seed.refundId, plannedAmount: 40_000 },
    ]);

    const result = await createBudgetMonth(db, seed.householdId, "2026-11-01");
    assert.equal(result.ok, true);

    const budget = await getBudgetMonth(db, seed.householdId, "2026-11-01");
    assert.equal(budget?.status, "draft", "a copy of a confirmed month is a draft");
    assert.equal(budget?.copiedFromId, previousId);
    assert.deepEqual(
      planned(budget?.lines ?? []),
      planned([
        { itemId: seed.rentId, incomeSourceId: null, plannedAmount: 500_000 },
        { itemId: seed.foodId, incomeSourceId: null, plannedAmount: 0 },
        { itemId: null, incomeSourceId: seed.salaryId, plannedAmount: 1_500_000 },
        // Nov 2026 has 4 Fridays: 50.000 * 4, not the 250.000 copied from October.
        { itemId: null, incomeSourceId: seed.fridayId, plannedAmount: 200_000 },
        { itemId: null, incomeSourceId: seed.refundId, plannedAmount: 40_000 },
      ]),
    );
  });

  it("copies from the most recent earlier month and ignores later ones", async () => {
    const seed = await seedHousehold("recent");
    await insertMonth(seed, "2026-07-01", [{ itemId: seed.rentId, plannedAmount: 100 }]);
    const september = await insertMonth(seed, "2026-09-01", [
      { itemId: seed.rentId, plannedAmount: 300 },
    ]);
    await insertMonth(seed, "2026-12-01", [{ itemId: seed.rentId, plannedAmount: 999 }]);

    await createBudgetMonth(db, seed.householdId, "2026-10-01");
    const budget = await getBudgetMonth(db, seed.householdId, "2026-10-01");
    assert.equal(budget?.copiedFromId, september);
    assert.deepEqual(
      budget?.lines.map((l) => l.plannedAmount),
      [300],
    );
  });

  it("returns the existing month without duplicating lines when it already exists", async () => {
    const seed = await seedHousehold("again");
    await insertMonth(seed, "2026-09-01", [{ itemId: seed.rentId, plannedAmount: 300 }]);

    const first = await createBudgetMonth(db, seed.householdId, "2026-10-01");
    const second = await createBudgetMonth(db, seed.householdId, "2026-10-01");
    assert.equal(first.ok && first.created, true);
    assert.equal(second.ok && second.created, false);
    assert.equal(first.ok && second.ok && first.id === second.id, true);

    const budget = await getBudgetMonth(db, seed.householdId, "2026-10-01");
    assert.equal(budget?.lines.length, 1);
  });

  it("never copies or reads another household's budget", async () => {
    const mine = await seedHousehold("mine");
    const other = await seedHousehold("other");
    await insertMonth(other, "2026-09-01", [{ itemId: other.rentId, plannedAmount: 777 }]);

    await createBudgetMonth(db, mine.householdId, "2026-10-01");
    const budget = await getBudgetMonth(db, mine.householdId, "2026-10-01");
    assert.equal(budget?.copiedFromId, null);
    assert.deepEqual(budget?.lines, []);

    assert.equal(await getBudgetMonth(db, mine.householdId, "2026-09-01"), null);
  });

  it("rejects a month that is not the first day and inserts nothing", async () => {
    const seed = await seedHousehold("invalid");
    const result = await createBudgetMonth(db, seed.householdId, "2026-10-15");
    assert.deepEqual(result, { ok: false, error: "invalid_month" });
    assert.equal(await getBudgetMonth(db, seed.householdId, "2026-10-15"), null);
    assert.equal(await getBudgetMonth(db, seed.householdId, "2026-10-01"), null);
  });
});
