import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { expectedReimbursement, validateExpenseInput } from "./expenses.ts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("expectedReimbursement", () => {
  it("applies the percentage and rounds to an integer", () => {
    assert.equal(expectedReimbursement(10000, 70), 7000);
    assert.equal(expectedReimbursement(12345, 30), 3704);
  });

  it("is zero when the item is not reimbursable", () => {
    assert.equal(expectedReimbursement(10000, null), 0);
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

  it("rejects years outside 2000-2100, including year zero (Postgres has none)", () => {
    for (const spentOn of ["0000-01-01", "1999-12-31", "2101-01-01"]) {
      const result = validateExpenseInput({ ...valid, spentOn });
      assert.equal(result.ok, false, spentOn);
      if (!result.ok) assert.ok(result.errors.spentOn, spentOn);
    }
    for (const spentOn of ["2000-01-01", "2100-12-31"]) {
      assert.equal(validateExpenseInput({ ...valid, spentOn }).ok, true, spentOn);
    }
  });

  it("rejects a budget month outside 2000-2100", () => {
    for (const budgetMonth of ["0000-01", "1999-12", "2101-01"]) {
      const result = validateExpenseInput({ ...valid, budgetMonth });
      assert.equal(result.ok, false, budgetMonth);
      if (!result.ok) assert.ok(result.errors.budgetMonth, budgetMonth);
    }
  });
});
