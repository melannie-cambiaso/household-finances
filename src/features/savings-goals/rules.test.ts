import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { goalProgress, perMonthNeeded, validateGoalInput } from "./rules.ts";

describe("validateGoalInput", () => {
  it("accepts a valid goal and trims the name", () => {
    const result = validateGoalInput({
      name: "  Emergency fund  ",
      targetAmount: 1_000_000,
      targetDate: null,
    });
    assert.deepEqual(result, {
      ok: true,
      value: { name: "Emergency fund", targetAmount: 1_000_000, targetDate: null },
    });
  });

  it("rejects a blank name", () => {
    assert.deepEqual(validateGoalInput({ name: "   ", targetAmount: 1000, targetDate: null }), {
      ok: false,
      error: "Enter a name",
    });
  });

  it("rejects a name over 60 characters", () => {
    const long = "x".repeat(61);
    assert.deepEqual(validateGoalInput({ name: long, targetAmount: 1000, targetDate: null }), {
      ok: false,
      error: "Use at most 60 characters",
    });
  });

  it("rejects a zero or negative amount", () => {
    assert.deepEqual(validateGoalInput({ name: "Trip", targetAmount: 0, targetDate: null }), {
      ok: false,
      error: "Enter an amount greater than zero",
    });
    assert.deepEqual(validateGoalInput({ name: "Trip", targetAmount: -5, targetDate: null }), {
      ok: false,
      error: "Enter an amount greater than zero",
    });
  });

  it("rejects a non-integer amount", () => {
    assert.deepEqual(validateGoalInput({ name: "Trip", targetAmount: 10.5, targetDate: null }), {
      ok: false,
      error: "Enter an amount greater than zero",
    });
  });

  it("accepts a valid target date and rejects an invalid one", () => {
    const ok = validateGoalInput({ name: "Trip", targetAmount: 1000, targetDate: "2026-12-01" });
    assert.equal(ok.ok, true);

    const bad = validateGoalInput({ name: "Trip", targetAmount: 1000, targetDate: "2026-13-40" });
    assert.deepEqual(bad, { ok: false, error: "Enter a valid date" });
  });
});

describe("goalProgress", () => {
  it("is partial when less has been contributed than the target", () => {
    const progress = goalProgress(1_000_000, 250_000);
    assert.equal(progress.achieved, false);
    assert.equal(progress.remaining, 750_000);
    assert.equal(progress.pct, 25);
  });

  it("is achieved exactly at the target, with nothing remaining", () => {
    const progress = goalProgress(500_000, 500_000);
    assert.equal(progress.achieved, true);
    assert.equal(progress.remaining, 0);
    assert.equal(progress.pct, 100);
  });

  it("caps the percentage and keeps the overshoot when more was contributed", () => {
    const progress = goalProgress(400_000, 500_000);
    assert.equal(progress.achieved, true);
    assert.equal(progress.remaining, 0);
    assert.equal(progress.overshoot, 100_000);
    assert.equal(progress.pct, 100);
  });

  it("is zero everywhere when nothing was contributed", () => {
    const progress = goalProgress(300_000, 0);
    assert.equal(progress.achieved, false);
    assert.equal(progress.remaining, 300_000);
    assert.equal(progress.overshoot, 0);
    assert.equal(progress.pct, 0);
  });
});

describe("perMonthNeeded", () => {
  const TODAY = "2026-11-02";

  it("divides what is left by the whole months left, counting the target month", () => {
    // November, December and January: 3 months to reach 2027-01-31.
    assert.equal(perMonthNeeded(TODAY, "2027-01-31", 900_000), 300_000);
  });

  it("is the whole remainder when the target date is this month", () => {
    assert.equal(perMonthNeeded(TODAY, "2026-11-30", 50_000), 50_000);
  });

  it("needs nothing when the goal is already achieved", () => {
    assert.equal(perMonthNeeded(TODAY, "2027-01-31", 0), 0);
  });

  it("is null when the target date has passed", () => {
    assert.equal(perMonthNeeded(TODAY, "2026-10-31", 100_000), null);
  });
});
