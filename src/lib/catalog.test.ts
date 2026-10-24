import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NAME_MAX_LENGTH,
  sameName,
  validateCategoryName,
  validateItemInput,
} from "./catalog.ts";

const CATEGORY = "11111111-1111-4111-8111-111111111111";

describe("validateCategoryName", () => {
  it("trims the name", () => {
    assert.deepEqual(validateCategoryName("  Groceries  "), {
      ok: true,
      name: "Groceries",
    });
  });

  it("rejects a blank name", () => {
    for (const raw of ["", "   "]) {
      const result = validateCategoryName(raw);
      assert.equal(result.ok, false, JSON.stringify(raw));
    }
  });

  it("accepts a name of exactly the maximum length and rejects one more", () => {
    assert.equal(validateCategoryName("a".repeat(NAME_MAX_LENGTH)).ok, true);
    assert.equal(validateCategoryName("a".repeat(NAME_MAX_LENGTH + 1)).ok, false);
  });

  it("counts the length after trimming", () => {
    assert.equal(validateCategoryName(` ${"a".repeat(NAME_MAX_LENGTH)} `).ok, true);
  });
});

describe("sameName", () => {
  it("ignores upper and lower case", () => {
    assert.equal(sameName("Groceries", "groceries"), true);
  });

  it("ignores surrounding and repeated spaces", () => {
    assert.equal(sameName("  Health   care ", "health care"), true);
  });

  it("tells different names apart", () => {
    assert.equal(sameName("Rent", "Rents"), false);
  });
});

describe("validateItemInput", () => {
  const valid = { name: "Pharmacy", categoryId: CATEGORY, reimbursementPct: "30" };

  it("normalizes a valid item", () => {
    assert.deepEqual(validateItemInput(valid), {
      ok: true,
      value: { name: "Pharmacy", categoryId: CATEGORY, reimbursementPct: 30 },
    });
  });

  it("treats a blank percentage as not reimbursable", () => {
    for (const reimbursementPct of ["", "   "]) {
      const result = validateItemInput({ ...valid, reimbursementPct });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.value.reimbursementPct, null);
    }
  });

  it("accepts 0 and 100 as percentages", () => {
    for (const [raw, expected] of [["0", 0], ["100", 100]] as const) {
      const result = validateItemInput({ ...valid, reimbursementPct: raw });
      assert.equal(result.ok, true, raw);
      if (result.ok) assert.equal(result.value.reimbursementPct, expected);
    }
  });

  it("rejects percentages that are not whole numbers from 0 to 100", () => {
    for (const reimbursementPct of ["101", "-1", "70.5", "70%", "abc", "1e2", "07x"]) {
      const result = validateItemInput({ ...valid, reimbursementPct });
      assert.equal(result.ok, false, reimbursementPct);
      if (!result.ok) {
        assert.deepEqual(Object.keys(result.errors), ["reimbursementPct"], reimbursementPct);
      }
    }
  });

  it("reports every invalid field at once", () => {
    const result = validateItemInput({
      name: "  ",
      categoryId: "not-a-uuid",
      reimbursementPct: "200",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors).sort(), [
        "categoryId",
        "name",
        "reimbursementPct",
      ]);
    }
  });

  it("trims the name and rejects one that is too long", () => {
    const trimmed = validateItemInput({ ...valid, name: "  Pharmacy " });
    assert.equal(trimmed.ok && trimmed.value.name, "Pharmacy");
    const tooLong = validateItemInput({ ...valid, name: "a".repeat(NAME_MAX_LENGTH + 1) });
    assert.equal(tooLong.ok, false);
  });
});
