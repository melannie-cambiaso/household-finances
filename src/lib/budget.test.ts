import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProgressReport,
  fridaysInMonth,
  parseBudgetForm,
  perFridayPlanned,
  progressOf,
} from "./budget.ts";

const ITEM = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";

describe("fridaysInMonth", () => {
  it("counts the Fridays of a month", () => {
    assert.equal(fridaysInMonth("2026-10-01"), 5); // Oct 2, 9, 16, 23, 30
    assert.equal(fridaysInMonth("2026-11-01"), 4);
    assert.equal(fridaysInMonth("2026-05-01"), 5); // May 1, 8, 15, 22, 29
  });

  it("handles February in leap and non-leap years", () => {
    assert.equal(fridaysInMonth("2008-02-01"), 5); // leap, starts on a Friday: 1, 8, 15, 22, 29
    assert.equal(fridaysInMonth("2024-02-01"), 4); // leap: 2, 9, 16, 23
    assert.equal(fridaysInMonth("2027-02-01"), 4); // non-leap: 5, 12, 19, 26
  });
});

describe("perFridayPlanned", () => {
  it("is the rate times the Fridays of the month", () => {
    assert.equal(perFridayPlanned(50_000, "2026-10-01"), 250_000);
    assert.equal(perFridayPlanned(50_000, "2026-11-01"), 200_000);
  });

  it("is zero without a rate", () => {
    assert.equal(perFridayPlanned(null, "2026-10-01"), 0);
  });
});

describe("parseBudgetForm", () => {
  it("reads item and source amounts, treating blank as no line", () => {
    const result = parseBudgetForm([
      [`item:${ITEM}`, "12.500"],
      [`source:${SOURCE}`, ""],
    ]);
    assert.deepEqual(result, {
      ok: true,
      lines: [{ kind: "item", id: ITEM, plannedAmount: 12500 }],
    });
  });

  it("accepts zero as a planned amount", () => {
    const result = parseBudgetForm([[`item:${ITEM}`, "0"]]);
    assert.deepEqual(result, {
      ok: true,
      lines: [{ kind: "item", id: ITEM, plannedAmount: 0 }],
    });
  });

  it("reports every invalid amount by field name and keeps nothing", () => {
    const result = parseBudgetForm([
      [`item:${ITEM}`, "12,5"],
      [`source:${SOURCE}`, "-3"],
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors).sort(), [
        `item:${ITEM}`,
        `source:${SOURCE}`,
      ]);
    }
  });

  it("rejects zero written other than as a plain 0, and amounts over the integer limit", () => {
    for (const raw of ["00", "0.000", "2.147.483.648"]) {
      const result = parseBudgetForm([[`item:${ITEM}`, raw]]);
      assert.equal(result.ok, false, raw);
    }
    const limit = parseBudgetForm([[`item:${ITEM}`, "2.147.483.647"]]);
    assert.equal(limit.ok, true);
  });

  it("ignores fields that are not budget amounts", () => {
    const result = parseBudgetForm([
      ["month", "2026-10"],
      [`item:${ITEM}`, "100"],
    ]);
    assert.equal(result.ok, true);
  });

  it("rejects an id that is not a uuid", () => {
    const result = parseBudgetForm([["item:nope", "100"]]);
    assert.equal(result.ok, false);
  });

  it("rejects the same target sent twice", () => {
    const result = parseBudgetForm([
      [`item:${ITEM}`, "100"],
      [`item:${ITEM}`, "200"],
    ]);
    assert.equal(result.ok, false);
  });
});

describe("progressOf", () => {
  it("computes remaining and percent used", () => {
    assert.deepEqual(progressOf(100_000, 25_000), {
      planned: 100_000,
      actual: 25_000,
      remaining: 75_000,
      percent: 25,
      over: false,
    });
  });

  it("flags overspending", () => {
    const progress = progressOf(100_000, 130_000);
    assert.equal(progress.over, true);
    assert.equal(progress.remaining, -30_000);
    assert.equal(progress.percent, 130);
  });

  it("has no percent when nothing was planned", () => {
    const progress = progressOf(0, 5_000);
    assert.equal(progress.percent, null);
    assert.equal(progress.over, true);
  });

  it("is not over when nothing was planned or spent", () => {
    assert.equal(progressOf(0, 0).over, false);
  });
});

describe("buildProgressReport", () => {
  const items = [
    { id: "rent", name: "Rent", categoryId: "home", categoryName: "Home" },
    { id: "food", name: "Food", categoryId: "home", categoryName: "Home" },
    { id: "doctor", name: "Doctor", categoryId: "health", categoryName: "Health" },
    { id: "unused", name: "Unused", categoryId: "health", categoryName: "Health" },
  ];
  const sources = [
    { id: "salary", name: "Salary", kind: "fixed" as const },
    { id: "refunds", name: "Refunds", kind: "reimbursement" as const },
    { id: "idle", name: "Idle", kind: "fixed" as const },
  ];

  const report = buildProgressReport({
    items,
    sources,
    plannedByItem: { rent: 500_000, food: 100_000, doctor: 0 },
    spentByItem: { rent: 500_000, food: 130_000, extra: 1, doctor: 20_000 },
    plannedBySource: { salary: 1_500_000, refunds: 40_000 },
    receivedBySource: { salary: 1_500_000, refunds: 10_000 },
  });

  it("groups items by category, sorted by name, summing each category", () => {
    assert.deepEqual(
      report.categories.map((c) => c.name),
      ["Health", "Home"],
    );
    const home = report.categories.find((c) => c.name === "Home");
    assert.deepEqual(
      home?.items.map((i) => i.name),
      ["Food", "Rent"],
    );
    assert.deepEqual(home?.progress, progressOf(600_000, 630_000));
    assert.equal(home?.progress.over, true);
  });

  it("keeps an item that has a line of zero or only spending, and drops an untouched one", () => {
    const health = report.categories.find((c) => c.name === "Health");
    assert.deepEqual(
      health?.items.map((i) => i.name),
      ["Doctor"],
    );
    assert.equal(health?.items[0].unplanned, false); // a line of 0 is still planned
  });

  it("flags spending that has no line as unplanned", () => {
    const withUnplanned = buildProgressReport({
      items,
      sources,
      plannedByItem: {},
      spentByItem: { food: 7_000 },
      plannedBySource: {},
      receivedBySource: {},
    });
    const food = withUnplanned.categories[0].items[0];
    assert.equal(food.unplanned, true);
    assert.deepEqual(food.progress, progressOf(0, 7_000));
  });

  it("ignores spending on ids that are not known items", () => {
    const all = report.categories.flatMap((c) => c.items.map((i) => i.id));
    assert.equal(all.includes("extra"), false);
  });

  it("reports income per source and omits sources with nothing planned or received", () => {
    assert.deepEqual(
      report.sources.map((s) => s.name),
      ["Refunds", "Salary"],
    );
    assert.deepEqual(report.sources[0].progress, progressOf(40_000, 10_000));
  });

  it("totals expenses and incomes", () => {
    assert.deepEqual(report.expenseTotal, progressOf(600_000, 650_000));
    assert.deepEqual(report.incomeTotal, progressOf(1_540_000, 1_510_000));
  });
});
