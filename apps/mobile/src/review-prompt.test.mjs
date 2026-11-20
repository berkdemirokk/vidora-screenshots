// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_REVIEW_STATE,
  nextReviewState,
  parseReviewState,
} from "./review-prompt.ts";

test("asks on the 3rd save, then not again in the same version", () => {
  let state = EMPTY_REVIEW_STATE;
  const asks = [];
  for (let i = 0; i < 6; i++) {
    const step = nextReviewState(state, "1.1");
    asks.push(step.ask);
    state = step.state;
  }
  assert.deepEqual(asks, [false, false, true, false, false, false]);
});

test("a new app version may ask once more", () => {
  const first = nextReviewState({ saves: 5, askedVersion: "1.0" }, "1.1");
  assert.equal(first.ask, true);
  assert.equal(nextReviewState(first.state, "1.1").ask, false);
});

test("bad stored data starts from zero", () => {
  assert.deepEqual(parseReviewState("{nope"), EMPTY_REVIEW_STATE);
  assert.deepEqual(parseReviewState(null), EMPTY_REVIEW_STATE);
  assert.deepEqual(parseReviewState('{"saves":-4,"askedVersion":7}'), {
    saves: 0,
    askedVersion: null,
  });
});
