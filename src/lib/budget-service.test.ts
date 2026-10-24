import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.ts";
import {
  confirmBudgetMonth,
  createBudgetMonth,
  getBudgetMonth,
  getBudgetProgress,
  saveBudgetLines,
} from "./budget-service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

describe("budget service", { skip: !url }, () => {
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
    await db.delete(schema.incomes).where(inArray(schema.incomes.householdId, householdIds));
    await db.delete(schema.expenses).where(inArray(schema.expenses.householdId, householdIds));
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
    await db.delete(schema.users).where(inArray(schema.users.householdId, householdIds));
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

  describe("progress", () => {
    async function spend(seed: Seed, itemId: string, budgetMonth: string, amount: number) {
      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.householdId, seed.householdId));
      const userId =
        user?.id ??
        (
          await db
            .insert(schema.users)
            .values({
              householdId: seed.householdId,
              name: "t",
              email: `t-${randomUUID()}@test.invalid`,
            })
            .returning()
        )[0].id;
      const [account] = await db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(eq(schema.accounts.householdId, seed.householdId));
      await db.insert(schema.expenses).values({
        householdId: seed.householdId,
        itemId,
        accountId: account.id,
        budgetMonth,
        spentOn: budgetMonth,
        amount,
        createdBy: userId,
      });
      return { userId, accountId: account.id };
    }

    it("sums actual spending and income of the month against the planned lines", async () => {
      const seed = await seedHousehold("progress");
      await insertMonth(
        seed,
        "2026-10-01",
        [
          { itemId: seed.rentId, plannedAmount: 500_000 },
          { incomeSourceId: seed.salaryId, plannedAmount: 1_500_000 },
          { incomeSourceId: seed.refundId, plannedAmount: 40_000 },
        ],
        "draft",
      );
      const { userId, accountId } = await spend(seed, seed.rentId, "2026-10-01", 300_000);
      await spend(seed, seed.rentId, "2026-10-01", 250_000);
      await spend(seed, seed.foodId, "2026-10-01", 9_000); // no line: unplanned
      await spend(seed, seed.rentId, "2026-11-01", 111); // another month: ignored
      await db.insert(schema.incomes).values([
        { householdId: seed.householdId, incomeSourceId: seed.salaryId, accountId, budgetMonth: "2026-10-01", receivedOn: "2026-10-28", amount: 1_500_000, createdBy: userId },
        { householdId: seed.householdId, incomeSourceId: seed.refundId, accountId, budgetMonth: "2026-10-01", receivedOn: "2026-10-29", amount: 10_000, createdBy: userId },
        { householdId: seed.householdId, incomeSourceId: seed.refundId, accountId, budgetMonth: "2026-11-01", receivedOn: "2026-11-02", amount: 99, createdBy: userId },
      ]);

      const report = await getBudgetProgress(db, seed.householdId, "2026-10-01");
      assert.equal(report.categories.length, 1);
      const home = report.categories[0];
      assert.equal(home.name, "Home");
      assert.deepEqual(
        home.items.map((i) => [i.name, i.progress.planned, i.progress.actual, i.unplanned]),
        [
          ["Food", 0, 9_000, true],
          ["Rent", 500_000, 550_000, false],
        ],
      );
      assert.equal(home.progress.over, true);
      assert.deepEqual(
        report.sources.map((src) => [src.name, src.progress.planned, src.progress.actual]),
        [
          ["Refunds", 40_000, 10_000],
          ["Salary", 1_500_000, 1_500_000],
        ],
      );
      assert.equal(report.expenseTotal.actual, 559_000);
      assert.equal(report.incomeTotal.actual, 1_510_000);
    });

    it("works for a month without a budget: everything is unplanned", async () => {
      const seed = await seedHousehold("nobudget");
      await spend(seed, seed.rentId, "2026-10-01", 1_000);
      const report = await getBudgetProgress(db, seed.householdId, "2026-10-01");
      assert.equal(report.categories[0].items[0].unplanned, true);
      assert.equal(report.expenseTotal.planned, 0);
      assert.deepEqual(report.sources, []);
    });

    it("never mixes in another household's spending or budget", async () => {
      const mine = await seedHousehold("mine-progress");
      const other = await seedHousehold("other-progress");
      await insertMonth(other, "2026-10-01", [{ itemId: other.rentId, plannedAmount: 777 }], "draft");
      await spend(other, other.rentId, "2026-10-01", 888);

      const report = await getBudgetProgress(db, mine.householdId, "2026-10-01");
      assert.deepEqual(report.categories, []);
      assert.deepEqual(report.sources, []);
      assert.equal(report.expenseTotal.actual, 0);
    });
  });

  describe("save lines and confirm", () => {
    const amounts = (
      lines: { itemId: string | null; incomeSourceId: string | null; plannedAmount: number }[] = [],
    ) => planned(lines);

    it("replaces the lines of a draft with the submitted ones", async () => {
      const seed = await seedHousehold("save");
      await insertMonth(
        seed,
        "2026-10-01",
        [
          { itemId: seed.rentId, plannedAmount: 500_000 },
          { itemId: seed.foodId, plannedAmount: 80_000 },
        ],
        "draft",
      );

      const result = await saveBudgetLines(db, seed.householdId, "2026-10-01", [
        { kind: "item", id: seed.rentId, plannedAmount: 520_000 },
        { kind: "source", id: seed.salaryId, plannedAmount: 1_600_000 },
        { kind: "source", id: seed.refundId, plannedAmount: 0 },
      ]);
      assert.deepEqual(result, { ok: true });

      const budget = await getBudgetMonth(db, seed.householdId, "2026-10-01");
      // Food was not submitted (blank), so its line is gone.
      assert.deepEqual(
        amounts(budget?.lines),
        amounts([
          { itemId: seed.rentId, incomeSourceId: null, plannedAmount: 520_000 },
          { itemId: null, incomeSourceId: seed.salaryId, plannedAmount: 1_600_000 },
          { itemId: null, incomeSourceId: seed.refundId, plannedAmount: 0 },
        ]),
      );
      assert.equal(budget?.status, "draft");
    });

    it("rejects a source or item from another household and changes nothing", async () => {
      const mine = await seedHousehold("mine-save");
      const other = await seedHousehold("other-save");
      await insertMonth(mine, "2026-10-01", [{ itemId: mine.rentId, plannedAmount: 500_000 }], "draft");

      const badItem = await saveBudgetLines(db, mine.householdId, "2026-10-01", [
        { kind: "item", id: mine.foodId, plannedAmount: 1 },
        { kind: "item", id: other.rentId, plannedAmount: 2 },
      ]);
      assert.deepEqual(badItem, { ok: false, error: "target_not_found" });

      const badSource = await saveBudgetLines(db, mine.householdId, "2026-10-01", [
        { kind: "source", id: other.salaryId, plannedAmount: 3 },
      ]);
      assert.deepEqual(badSource, { ok: false, error: "target_not_found" });

      const budget = await getBudgetMonth(db, mine.householdId, "2026-10-01");
      assert.deepEqual(
        budget?.lines.map((l) => l.plannedAmount),
        [500_000],
        "the original lines survive a rejected save",
      );
    });

    it("rejects the same target submitted twice and changes nothing", async () => {
      const seed = await seedHousehold("dup");
      await insertMonth(seed, "2026-10-01", [{ itemId: seed.rentId, plannedAmount: 500_000 }], "draft");

      const result = await saveBudgetLines(db, seed.householdId, "2026-10-01", [
        { kind: "item", id: seed.foodId, plannedAmount: 1 },
        { kind: "item", id: seed.foodId, plannedAmount: 2 },
      ]);
      assert.deepEqual(result, { ok: false, error: "duplicate_target" });
      const budget = await getBudgetMonth(db, seed.householdId, "2026-10-01");
      assert.deepEqual(
        budget?.lines.map((l) => l.plannedAmount),
        [500_000],
      );
    });

    it("rejects saving into a month that has no budget", async () => {
      const seed = await seedHousehold("nomonth");
      const result = await saveBudgetLines(db, seed.householdId, "2026-10-01", [
        { kind: "item", id: seed.rentId, plannedAmount: 1 },
      ]);
      assert.deepEqual(result, { ok: false, error: "month_not_found" });
      assert.equal(await getBudgetMonth(db, seed.householdId, "2026-10-01"), null);
    });

    it("confirms a draft once, and a confirmed month rejects further saves", async () => {
      const seed = await seedHousehold("confirm");
      await insertMonth(seed, "2026-10-01", [{ itemId: seed.rentId, plannedAmount: 500_000 }], "draft");

      const confirmed = await confirmBudgetMonth(db, seed.householdId, "2026-10-01");
      assert.deepEqual(confirmed, { ok: true });
      const afterConfirm = await getBudgetMonth(db, seed.householdId, "2026-10-01");
      assert.equal(afterConfirm?.status, "confirmed");
      assert.ok(afterConfirm?.confirmedAt instanceof Date);

      // Confirming again is harmless and does not move the timestamp.
      await confirmBudgetMonth(db, seed.householdId, "2026-10-01");
      const again = await getBudgetMonth(db, seed.householdId, "2026-10-01");
      assert.equal(again?.confirmedAt?.getTime(), afterConfirm?.confirmedAt?.getTime());

      const save = await saveBudgetLines(db, seed.householdId, "2026-10-01", [
        { kind: "item", id: seed.foodId, plannedAmount: 9 },
      ]);
      assert.deepEqual(save, { ok: false, error: "month_locked" });
      assert.deepEqual(
        again?.lines.map((l) => l.plannedAmount),
        [500_000],
      );
    });

    it("cannot confirm a month that has no budget or belongs to another household", async () => {
      const mine = await seedHousehold("mine-confirm");
      const other = await seedHousehold("other-confirm");
      await insertMonth(other, "2026-10-01", [], "draft");

      const none = await confirmBudgetMonth(db, mine.householdId, "2026-10-01");
      assert.deepEqual(none, { ok: false, error: "month_not_found" });

      const otherBudget = await getBudgetMonth(db, other.householdId, "2026-10-01");
      assert.equal(otherBudget?.status, "draft");
    });
  });
});
