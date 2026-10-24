import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
