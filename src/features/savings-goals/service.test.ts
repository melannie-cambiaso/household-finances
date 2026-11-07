import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../../db/schema.ts";
import { archiveGoal, createGoal, getGoal, listGoalsWithProgress, updateGoal } from "./service.ts";

// Integration test: needs a Postgres with the migrations applied.
// Run with TEST_DATABASE_URL pointing at a throwaway database; skipped otherwise.
const url = process.env.TEST_DATABASE_URL;

describe("savings goals service", { skip: !url }, () => {
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
    const [salary] = await db
      .insert(schema.accounts)
      .values({ householdId: household.id, name: "Salary", kind: "salary" })
      .returning();
    const [savings] = await db
      .insert(schema.accounts)
      .values({ householdId: household.id, name: "Savings", kind: "savings" })
      .returning();
    return { householdId: household.id, salaryId: salary.id, savingsId: savings.id };
  }
  type Seed = Awaited<ReturnType<typeof seedHousehold>>;

  after(async () => {
    try {
      // Each test built its own household, so cleanup is per household. Every
      // transfer goes first: one test links a transfer of another household to
      // a goal of this one, and deleting a goal that a transfer still points at
      // fails the foreign key.
      for (const id of householdIds) {
        await db.delete(schema.transfers).where(eq(schema.transfers.householdId, id));
      }
      for (const id of householdIds) {
        await db.delete(schema.savingsGoals).where(eq(schema.savingsGoals.householdId, id));
        await db.delete(schema.accounts).where(eq(schema.accounts.householdId, id));
        await db.delete(schema.households).where(eq(schema.households.id, id));
      }
    } finally {
      // A failing cleanup must not leave the connection open: the run would
      // never exit and CI would hang until its timeout.
      await sql.end();
    }
  });

  async function contribute(seed: Seed, goalId: string, amount: number, madeOn: string) {
    await db.insert(schema.transfers).values({
      householdId: seed.householdId,
      fromAccountId: seed.salaryId,
      toAccountId: seed.savingsId,
      amount,
      madeOn,
      kind: "other",
      goalId,
    });
  }

  it("creates a goal and lists it with zero progress", async () => {
    const seed = await seedHousehold("create");
    const created = await createGoal(db, seed.householdId, {
      name: "Emergency fund",
      targetAmount: 1_000_000,
      targetDate: null,
    });
    assert.equal(created.ok, true);

    const goals = await listGoalsWithProgress(db, seed.householdId);
    assert.equal(goals.length, 1);
    assert.equal(goals[0].name, "Emergency fund");
    assert.equal(goals[0].progress.contributed, 0);
    assert.equal(goals[0].progress.achieved, false);
    assert.equal(goals[0].progress.pct, 0);
  });

  it("derives progress from the transfers linked to the goal", async () => {
    const seed = await seedHousehold("progress");
    const created = await createGoal(db, seed.householdId, {
      name: "Trip",
      targetAmount: 400_000,
      targetDate: null,
    });
    assert.ok(created.ok);
    const goalId = created.ok ? created.id : "";

    await contribute(seed, goalId, 150_000, "2026-11-01");
    await contribute(seed, goalId, 50_000, "2026-11-05");

    const [goal] = await listGoalsWithProgress(db, seed.householdId);
    assert.equal(goal.progress.contributed, 200_000);
    assert.equal(goal.progress.remaining, 200_000);
    assert.equal(goal.progress.pct, 50);
    assert.equal(goal.progress.achieved, false);
  });

  it("marks a goal achieved once contributions reach the target", async () => {
    const seed = await seedHousehold("achieved");
    const created = await createGoal(db, seed.householdId, {
      name: "Bike",
      targetAmount: 100_000,
      targetDate: null,
    });
    if (!created.ok) throw new Error("create failed");
    await contribute(seed, created.id, 120_000, "2026-11-01");

    const [goal] = await listGoalsWithProgress(db, seed.householdId);
    assert.equal(goal.progress.achieved, true);
    assert.equal(goal.progress.overshoot, 20_000);
    assert.equal(goal.progress.pct, 100);
  });

  it("ignores transfers of other households and unlinked transfers", async () => {
    const seed = await seedHousehold("scoped");
    const other = await seedHousehold("other");
    const created = await createGoal(db, seed.householdId, {
      name: "Isolated",
      targetAmount: 100_000,
      targetDate: null,
    });
    if (!created.ok) throw new Error("create failed");

    await contribute(seed, created.id, 30_000, "2026-11-01");
    await db.insert(schema.transfers).values({
      householdId: other.householdId,
      fromAccountId: other.salaryId,
      toAccountId: other.savingsId,
      amount: 999_999,
      madeOn: "2026-11-02",
      kind: "other",
      goalId: created.id,
    });

    const [goal] = await listGoalsWithProgress(db, seed.householdId);
    assert.equal(goal.progress.contributed, 30_000);
  });

  it("updates a goal's name, target and date", async () => {
    const seed = await seedHousehold("update");
    const created = await createGoal(db, seed.householdId, {
      name: "Old name",
      targetAmount: 100_000,
      targetDate: null,
    });
    if (!created.ok) throw new Error("create failed");

    const updated = await updateGoal(db, seed.householdId, created.id, {
      name: "New name",
      targetAmount: 250_000,
      targetDate: "2027-06-30",
    });
    assert.deepEqual(updated, { ok: true });

    const goal = await getGoal(db, seed.householdId, created.id);
    assert.equal(goal?.name, "New name");
    assert.equal(goal?.targetAmount, 250_000);
    assert.equal(goal?.targetDate, "2027-06-30");
  });

  it("refuses to update a goal of another household", async () => {
    const seed = await seedHousehold("owner");
    const stranger = await seedHousehold("stranger");
    const created = await createGoal(db, seed.householdId, {
      name: "Mine",
      targetAmount: 100_000,
      targetDate: null,
    });
    if (!created.ok) throw new Error("create failed");

    const updated = await updateGoal(db, stranger.householdId, created.id, {
      name: "Stolen",
      targetAmount: 1,
      targetDate: null,
    });
    assert.deepEqual(updated, { ok: false, error: "goal_not_found" });
  });

  it("archives a goal, keeps its contributions, and sorts it last", async () => {
    const seed = await seedHousehold("archive");
    const first = await createGoal(db, seed.householdId, {
      name: "Active",
      targetAmount: 100_000,
      targetDate: null,
    });
    const second = await createGoal(db, seed.householdId, {
      name: "Done",
      targetAmount: 50_000,
      targetDate: null,
    });
    if (!first.ok || !second.ok) throw new Error("create failed");
    await contribute(seed, second.id, 60_000, "2026-11-01");

    const archived = await archiveGoal(db, seed.householdId, second.id);
    assert.deepEqual(archived, { ok: true });

    // Archiving twice finds nothing left to archive.
    const again = await archiveGoal(db, seed.householdId, second.id);
    assert.deepEqual(again, { ok: false, error: "goal_not_found" });

    const goals = await listGoalsWithProgress(db, seed.householdId);
    assert.equal(goals[0].name, "Active");
    assert.equal(goals[1].name, "Done");
    assert.ok(goals[1].archivedAt !== null);
    // History survives: the contributions still count.
    assert.equal(goals[1].progress.contributed, 60_000);
    assert.equal(goals[1].progress.achieved, true);
  });
});
