import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  firstOfMonth,
  formatMonthLabel,
  parseMonthParam,
  shiftMonth,
  todayIn,
} from "./dates.ts";

describe("firstOfMonth", () => {
  it("returns the first day of the month", () => {
    assert.equal(firstOfMonth("2026-10-23"), "2026-10-01");
    assert.equal(firstOfMonth("2026-01-01"), "2026-01-01");
  });
});

describe("parseMonthParam", () => {
  const today = "2026-10-23";

  it("returns the first day of a valid YYYY-MM value", () => {
    assert.equal(parseMonthParam("2026-03", today), "2026-03-01");
  });

  it("falls back to the current month when missing or invalid", () => {
    assert.equal(parseMonthParam(undefined, today), "2026-10-01");
    assert.equal(parseMonthParam("2026-13", today), "2026-10-01");
    assert.equal(parseMonthParam("nope", today), "2026-10-01");
    assert.equal(parseMonthParam("2026-3", today), "2026-10-01");
    assert.equal(parseMonthParam("0000-01", today), "2026-10-01");
    assert.equal(parseMonthParam("1999-12", today), "2026-10-01");
  });
});

describe("formatMonthLabel", () => {
  it("spells out the month and year", () => {
    assert.equal(formatMonthLabel("2026-10-01"), "October 2026");
    assert.equal(formatMonthLabel("2027-01-01"), "January 2027");
  });
});

describe("shiftMonth", () => {
  it("moves forward and backward by months", () => {
    assert.equal(shiftMonth("2026-10-01", 1), "2026-11-01");
    assert.equal(shiftMonth("2026-10-01", -1), "2026-09-01");
  });

  it("crosses year boundaries", () => {
    assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
    assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  });
});

describe("todayIn", () => {
  it("uses the calendar day of the given time zone, not UTC", () => {
    // 01:30 UTC on the 24th is still the evening of the 23rd in Chile (UTC-3).
    const now = new Date("2026-10-24T01:30:00Z");
    assert.equal(todayIn("America/Santiago", now), "2026-10-23");
    assert.equal(todayIn("UTC", now), "2026-10-24");
  });
});
