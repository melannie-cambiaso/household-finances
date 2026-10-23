import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expectedReimbursement,
  firstOfMonth,
  formatClp,
  parseAmount,
  parseMonthParam,
  shiftMonth,
  todayIn,
  validateExpenseInput,
} from "./expenses.ts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("parseAmount", () => {
  it("parses plain integers", () => {
    assert.equal(parseAmount("12500"), 12500);
    assert.equal(parseAmount(" 900 "), 900);
  });

  it("accepts dots as thousands separators", () => {
    assert.equal(parseAmount("12.500"), 12500);
    assert.equal(parseAmount("1.234.567"), 1234567);
  });

  it("rejects decimals, commas, negatives, zero and text", () => {
    for (const bad of ["12,5", "12.5", "1.23", "-100", "0", "", "abc", "1e3"]) {
      assert.equal(parseAmount(bad), null, bad);
    }
  });

  it("rejects values above the Postgres integer limit", () => {
    assert.equal(parseAmount("2147483647"), 2147483647);
    assert.equal(parseAmount("2147483648"), null);
  });
});

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

describe("expectedReimbursement", () => {
  it("applies the percentage and rounds to an integer", () => {
    assert.equal(expectedReimbursement(10000, 70), 7000);
    assert.equal(expectedReimbursement(12345, 30), 3704);
  });

  it("is zero when the item is not reimbursable", () => {
    assert.equal(expectedReimbursement(10000, null), 0);
  });
});

describe("formatClp", () => {
  it("formats with dot thousands separators and no decimals", () => {
    const out = formatClp(1234567).replace(/\s/g, "");
    assert.ok(out.includes("1.234.567"), out);
    assert.ok(!out.includes(","), out);
  });
});

describe("validateExpenseInput", () => {
  const valid = {
    itemId: UUID_A,
    accountId: UUID_B,
    amount: "12.500",
    spentOn: "2026-10-23",
    budgetMonth: "",
    description: "  Groceries run  ",
  };

  it("accepts a valid input and normalizes it", () => {
    const result = validateExpenseInput(valid);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, {
        itemId: UUID_A,
        accountId: UUID_B,
        amount: 12500,
        spentOn: "2026-10-23",
        budgetMonth: "2026-10-01",
        description: "Groceries run",
      });
    }
  });

  it("keeps an explicit budget month and normalizes it to the first day", () => {
    const result = validateExpenseInput({ ...valid, budgetMonth: "2026-11" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.budgetMonth, "2026-11-01");
  });

  it("turns an empty description into null", () => {
    const result = validateExpenseInput({ ...valid, description: "   " });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.description, null);
  });

  it("reports every invalid field", () => {
    const result = validateExpenseInput({
      itemId: "nope",
      accountId: "",
      amount: "-5",
      spentOn: "2026-02-30",
      budgetMonth: "2026-99",
      description: "x".repeat(201),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors).sort(), [
        "accountId",
        "amount",
        "budgetMonth",
        "description",
        "itemId",
        "spentOn",
      ]);
    }
  });

  it("rejects impossible calendar dates", () => {
    const result = validateExpenseInput({ ...valid, spentOn: "2026-02-30" });
    assert.equal(result.ok, false);
  });
});
