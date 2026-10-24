import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { transferKindLabel, validateTransferInput } from "./transfers.ts";

const SALARY = "11111111-1111-4111-8111-111111111111";
const SAVINGS = "22222222-2222-4222-8222-222222222222";

const valid = {
  fromAccountId: SALARY,
  toAccountId: SAVINGS,
  amount: "150.000",
  madeOn: "2026-10-23",
  kind: "repayment",
};

describe("validateTransferInput", () => {
  it("normalizes a valid transfer", () => {
    assert.deepEqual(validateTransferInput(valid), {
      ok: true,
      value: {
        fromAccountId: SALARY,
        toAccountId: SAVINGS,
        amount: 150000,
        madeOn: "2026-10-23",
        kind: "repayment",
      },
    });
  });

  it("accepts each kind", () => {
    for (const kind of ["repayment", "funding", "other"]) {
      const result = validateTransferInput({ ...valid, kind });
      assert.equal(result.ok, true, kind);
    }
  });

  it("trims what the form sends", () => {
    const result = validateTransferInput({
      ...valid,
      amount: " 900 ",
      madeOn: " 2026-10-23 ",
      kind: " funding ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.amount, 900);
      assert.equal(result.value.kind, "funding");
    }
  });

  it("refuses moving money from an account to itself", () => {
    const result = validateTransferInput({ ...valid, toAccountId: SALARY });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors), ["toAccountId"]);
    }
  });

  it("reports every invalid field", () => {
    const result = validateTransferInput({
      fromAccountId: "x",
      toAccountId: "",
      amount: "12,5",
      madeOn: "2026-02-30",
      kind: "gift",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors).sort(), [
        "amount",
        "fromAccountId",
        "kind",
        "madeOn",
        "toAccountId",
      ]);
    }
  });

  it("rejects zero and negative amounts", () => {
    for (const amount of ["0", "-5", ""]) {
      const result = validateTransferInput({ ...valid, amount });
      assert.equal(result.ok, false, amount);
    }
  });

  it("rejects a date outside the supported years", () => {
    const result = validateTransferInput({ ...valid, madeOn: "0000-01-01" });
    assert.equal(result.ok, false);
  });
});

describe("transferKindLabel", () => {
  it("describes each kind in words", () => {
    assert.equal(transferKindLabel("repayment"), "Repayment to savings");
    assert.equal(transferKindLabel("funding"), "Funding");
    assert.equal(transferKindLabel("other"), "Other");
  });
});
