import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  monthStatement,
  validateOpeningBalance,
  type Movement,
} from "./savings.ts";

const TODAY = "2026-10-24";

describe("validateOpeningBalance", () => {
  it("normalizes a valid opening balance", () => {
    assert.deepEqual(
      validateOpeningBalance({ amount: "1.250.000", on: "2026-09-30" }, TODAY),
      { ok: true, value: { amount: 1250000, on: "2026-09-30" } },
    );
  });

  it("accepts zero, which is a real starting point", () => {
    assert.deepEqual(
      validateOpeningBalance({ amount: "0", on: "2026-09-30" }, TODAY),
      { ok: true, value: { amount: 0, on: "2026-09-30" } },
    );
  });

  it("trims what the form sends and accepts today", () => {
    const result = validateOpeningBalance(
      { amount: " 500 ", on: ` ${TODAY} ` },
      TODAY,
    );
    assert.deepEqual(result, {
      ok: true,
      value: { amount: 500, on: TODAY },
    });
  });

  it("rejects an amount that is empty, negative, decimal or text", () => {
    for (const amount of ["", "-5", "1,5", "12.5", "abc", "1.00"]) {
      const result = validateOpeningBalance({ amount, on: "2026-09-30" }, TODAY);
      assert.equal(result.ok, false, amount);
      if (!result.ok) {
        assert.equal(
          result.errors.amount,
          "Enter a whole amount of zero or more",
          amount,
        );
      }
    }
  });

  it("rejects an invalid or future date", () => {
    for (const on of ["", "2026-02-30", "30-09-2026"]) {
      const result = validateOpeningBalance({ amount: "10", on }, TODAY);
      assert.equal(result.ok, false, on);
      if (!result.ok) assert.equal(result.errors.on, "Enter a valid date", on);
    }
    const future = validateOpeningBalance({ amount: "10", on: "2026-10-25" }, TODAY);
    assert.equal(future.ok, false);
    if (!future.ok) {
      assert.equal(future.errors.on, "The date cannot be in the future");
    }
  });

  it("reports both errors at once", () => {
    const result = validateOpeningBalance({ amount: "x", on: "nope" }, TODAY);
    assert.deepEqual(result, {
      ok: false,
      errors: {
        amount: "Enter a whole amount of zero or more",
        on: "Enter a valid date",
      },
    });
  });
});

function movement(
  date: string,
  amount: number,
  label = "x",
  kind: Movement["kind"] = "expense",
): Movement {
  return { date, amount, label, kind };
}

describe("monthStatement", () => {
  const opening = { amount: 1000, on: "2026-09-30" };

  it("starts from the opening amount and applies the month's movements", () => {
    const result = monthStatement(
      opening,
      [movement("2026-10-02", -300), movement("2026-10-10", 500)],
      "2026-10-01",
    );
    assert.equal(result.startBalance, 1000);
    assert.equal(result.endBalance, 1200);
    assert.equal(result.rows.length, 2);
  });

  it("lists rows newest first, each with the balance right after it", () => {
    const result = monthStatement(
      opening,
      [
        movement("2026-10-10", 500, "income"),
        movement("2026-10-02", -300, "spend"),
      ],
      "2026-10-01",
    );
    assert.deepEqual(
      result.rows.map((r) => [r.label, r.balance]),
      [
        ["income", 1200],
        ["spend", 700],
      ],
    );
  });

  it("keeps the order it was given for movements on the same day", () => {
    const result = monthStatement(
      opening,
      [movement("2026-10-05", -100, "first"), movement("2026-10-05", -50, "second")],
      "2026-10-01",
    );
    assert.deepEqual(
      result.rows.map((r) => [r.label, r.balance]),
      [
        ["second", 850],
        ["first", 900],
      ],
    );
  });

  it("carries earlier months into the starting balance", () => {
    const result = monthStatement(
      opening,
      [movement("2026-10-15", -200), movement("2026-11-03", 100)],
      "2026-11-01",
    );
    assert.equal(result.startBalance, 800);
    assert.equal(result.endBalance, 900);
    assert.equal(result.rows.length, 1);
  });

  it("ignores movements on or before the opening date", () => {
    const result = monthStatement(
      opening,
      [movement("2026-09-30", -999), movement("2026-09-01", -999)],
      "2026-10-01",
    );
    assert.equal(result.startBalance, 1000);
    assert.equal(result.endBalance, 1000);
    assert.deepEqual(result.rows, []);
  });

  it("has no starting balance when the opening falls inside the month", () => {
    const result = monthStatement(
      { amount: 1000, on: "2026-10-10" },
      [movement("2026-10-09", -999), movement("2026-10-12", -100)],
      "2026-10-01",
    );
    assert.equal(result.startBalance, null);
    assert.equal(result.endBalance, 900);
    assert.equal(result.rows.length, 1);
  });

  it("starts at the opening amount when the opening is the first day of the month", () => {
    const result = monthStatement(
      { amount: 1000, on: "2026-10-01" },
      [movement("2026-10-01", -999), movement("2026-10-02", -100)],
      "2026-10-01",
    );
    assert.equal(result.startBalance, 1000);
    assert.equal(result.endBalance, 900);
  });

  it("has no balance for a month entirely before the opening", () => {
    const result = monthStatement(
      opening,
      [movement("2026-08-10", -100)],
      "2026-08-01",
    );
    assert.equal(result.startBalance, null);
    assert.equal(result.endBalance, null);
    assert.deepEqual(result.rows, []);
  });

  it("can go negative and keeps the sign of each row", () => {
    const result = monthStatement(
      { amount: 100, on: "2026-09-30" },
      [movement("2026-10-02", -300)],
      "2026-10-01",
    );
    assert.equal(result.endBalance, -200);
    assert.equal(result.rows[0].amount, -300);
  });
});
