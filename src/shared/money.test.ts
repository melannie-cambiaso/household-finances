import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatClp, parseAmount } from "./money.ts";

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

describe("formatClp", () => {
  it("formats with dot thousands separators and no decimals", () => {
    const out = formatClp(1234567).replace(/\s/g, "");
    assert.ok(out.includes("1.234.567"), out);
    assert.ok(!out.includes(","), out);
  });
});
