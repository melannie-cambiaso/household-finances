import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { seedData } from "./seed-data.ts";

const { accounts, incomeSources, categories } = seedData;

function duplicates(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("seedData", () => {
  it("has one account of each kind", () => {
    assert.deepEqual(accounts.map((a) => a.kind).sort(), [
      "salary",
      "savings",
      "utilities",
    ]);
  });

  it("uses unique names so re-running can match rows by name", () => {
    assert.deepEqual(duplicates(accounts.map((a) => a.name)), []);
    assert.deepEqual(duplicates(incomeSources.map((s) => s.name)), []);
    assert.deepEqual(duplicates(categories.map((c) => c.name)), []);
    for (const category of categories) {
      assert.deepEqual(
        duplicates(category.items.map((i) => i.name)),
        [],
        `duplicate item in ${category.name}`,
      );
    }
  });

  it("points every income source at an existing account", () => {
    const names = accounts.map((a) => a.name);
    for (const source of incomeSources) {
      assert.ok(
        names.includes(source.defaultAccount),
        `${source.name} -> ${source.defaultAccount}`,
      );
    }
  });

  it("gives fixed and per-Friday sources an amount and reimbursements none", () => {
    for (const source of incomeSources) {
      if (source.kind === "reimbursement") {
        assert.equal(source.defaultAmount, null, source.name);
      } else {
        assert.ok(
          Number.isInteger(source.defaultAmount) && source.defaultAmount! > 0,
          source.name,
        );
      }
    }
  });

  it("covers every income source kind", () => {
    assert.deepEqual(incomeSources.map((s) => s.kind).sort(), [
      "fixed",
      "fixed",
      "per_friday",
      "reimbursement",
    ]);
  });

  it("keeps reimbursement percentages between 0 and 100, or null", () => {
    for (const category of categories) {
      for (const item of category.items) {
        const pct = item.reimbursementPct;
        assert.ok(
          pct === null || (Number.isInteger(pct) && pct >= 0 && pct <= 100),
          `${category.name} / ${item.name}`,
        );
      }
    }
  });

  it("gives every category at least one item", () => {
    for (const category of categories) {
      assert.ok(category.items.length > 0, category.name);
    }
  });

  it("includes at least one reimbursable item", () => {
    const reimbursable = categories.flatMap((c) =>
      c.items.filter((i) => i.reimbursementPct !== null),
    );
    assert.ok(reimbursable.length > 0);
  });
});
