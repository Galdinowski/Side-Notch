import assert from "node:assert/strict";
import test from "node:test";
import { pickNumber, pickOptionalNumber } from "./read-agents.mjs";

test("pickOptionalNumber keeps missing context as null", () => {
  assert.equal(pickOptionalNumber(undefined, null, ""), null);
  assert.equal(pickOptionalNumber("12.5"), 12.5);
  assert.equal(pickOptionalNumber(undefined, 40), 40);
});

test("pickNumber still defaults counts to zero", () => {
  assert.equal(pickNumber(undefined, null), 0);
  assert.equal(pickNumber("3"), 3);
});
