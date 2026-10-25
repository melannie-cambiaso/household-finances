import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Throwaway: it fails on purpose to prove that the protection rule of `main`
// blocks the merge. The pull request that carries it is closed, never merged.
describe("ci block proof", () => {
  it("fails on purpose", () => {
    assert.equal(1, 2);
  });
});
