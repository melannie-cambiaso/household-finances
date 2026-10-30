import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountNet } from "./account-nets.ts";

describe("accountNet", () => {
  it("adds incomes and transfers in, subtracts transfers out and expenses", () => {
    assert.equal(
      accountNet({ incomes: 500_000, transfersIn: 100_000, transfersOut: 50_000, expenses: 200_000 }),
      350_000,
    );
  });

  it("is negative when more left the account than came in", () => {
    assert.equal(
      accountNet({ incomes: 0, transfersIn: 0, transfersOut: 80_000, expenses: 20_000 }),
      -100_000,
    );
  });

  it("is zero for an account without movements", () => {
    assert.equal(accountNet({ incomes: 0, transfersIn: 0, transfersOut: 0, expenses: 0 }), 0);
  });
});
