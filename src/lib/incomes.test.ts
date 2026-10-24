import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pendingReimbursement, validateIncomeInput } from "./incomes.ts";

const SOURCE = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const EXPENSE = "33333333-3333-4333-8333-333333333333";

const valid = {
  incomeSourceId: SOURCE,
  accountId: ACCOUNT,
  amount: "1.500.000",
  receivedOn: "2026-10-23",
  budgetMonth: "",
  relatedExpenseId: "",
};

describe("validateIncomeInput", () => {
  it("normalizes a valid income and defaults the month to the received date", () => {
    const result = validateIncomeInput(valid);
    assert.deepEqual(result, {
      ok: true,
      value: {
        incomeSourceId: SOURCE,
        accountId: ACCOUNT,
        amount: 1500000,
        receivedOn: "2026-10-23",
        budgetMonth: "2026-10-01",
        relatedExpenseId: null,
      },
    });
  });

  it("accepts a budget month override and a related expense", () => {
    const result = validateIncomeInput({
      ...valid,
      budgetMonth: "2026-11",
      relatedExpenseId: EXPENSE,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.budgetMonth, "2026-11-01");
      assert.equal(result.value.relatedExpenseId, EXPENSE);
    }
  });

  it("reports every invalid field", () => {
    const result = validateIncomeInput({
      incomeSourceId: "x",
      accountId: "",
      amount: "12,5",
      receivedOn: "2026-02-30",
      budgetMonth: "2026-13",
      relatedExpenseId: "nope",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors).sort(), [
        "accountId",
        "amount",
        "budgetMonth",
        "incomeSourceId",
        "receivedOn",
        "relatedExpenseId",
      ]);
    }
  });

  it("rejects zero and negative amounts", () => {
    for (const amount of ["0", "-5"]) {
      const result = validateIncomeInput({ ...valid, amount });
      assert.equal(result.ok, false);
    }
  });
});

describe("pendingReimbursement", () => {
  it("is the expected amount minus what was already received", () => {
    assert.equal(pendingReimbursement(100000, 70, 0), 70000);
    assert.equal(pendingReimbursement(100000, 70, 20000), 50000);
  });

  it("never goes below zero when over-reimbursed", () => {
    assert.equal(pendingReimbursement(100000, 70, 90000), 0);
  });

  it("is zero when the expense is not reimbursable", () => {
    assert.equal(pendingReimbursement(100000, null, 0), 0);
  });
});
