import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAllowedEmail, parseAllowedEmails } from "./allowlist.ts";

describe("parseAllowedEmails", () => {
  it("splits on commas, trims and lowercases", () => {
    assert.deepEqual(parseAllowedEmails(" A@x.com , b@Y.com "), [
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("ignores empty entries", () => {
    assert.deepEqual(parseAllowedEmails("a@x.com,, ,"), ["a@x.com"]);
  });

  it("returns an empty list for undefined or empty input", () => {
    assert.deepEqual(parseAllowedEmails(undefined), []);
    assert.deepEqual(parseAllowedEmails(""), []);
  });
});

describe("isAllowedEmail", () => {
  const raw = "a@x.com,b@y.com";

  it("accepts an allowed email regardless of case and spaces", () => {
    assert.equal(isAllowedEmail(" A@X.com ", raw), true);
  });

  it("rejects an email that is not in the list", () => {
    assert.equal(isAllowedEmail("c@z.com", raw), false);
  });

  it("rejects everyone when the list is empty (closed by default)", () => {
    assert.equal(isAllowedEmail("a@x.com", undefined), false);
    assert.equal(isAllowedEmail("a@x.com", ""), false);
  });

  it("does not match by substring", () => {
    assert.equal(isAllowedEmail("a@x.co", raw), false);
    assert.equal(isAllowedEmail("aa@x.com", raw), false);
  });
});
