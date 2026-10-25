import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMAIL_NOT_ALLOWED, signInErrorMessage } from "./auth-errors.ts";

describe("signInErrorMessage", () => {
  it("explains that the email is not allowed", () => {
    const message = signInErrorMessage(EMAIL_NOT_ALLOWED);
    assert.equal(message.title, "This email is not allowed");
    assert.match(message.body, /not on the list/);
  });

  it("falls back to a generic message for any other code", () => {
    for (const code of ["state_not_found", "", undefined]) {
      const message = signInErrorMessage(code);
      assert.equal(message.title, "We could not sign you in");
    }
  });
});
