// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { hasTrial, trialNote, trialRenewal } from "./trial-copy.ts";

const plan = { period: "month", displayPrice: "₺999,99", trialDays: 3 };

test("trial note names the days and the price that follows", () => {
  assert.equal(trialNote(plan, "tr"), "3 gün ücretsiz, sonra ₺999,99/ay");
  assert.equal(trialNote(plan, "en"), "3-day free trial, then ₺999,99/month");
});

test("no trial means no note and no renewal sentence", () => {
  for (const p of [
    null,
    undefined,
    { ...plan, trialDays: 0 },
    { ...plan, trialDays: NaN },
  ]) {
    assert.equal(hasTrial(p), false);
    assert.equal(trialNote(p, "tr"), null);
    assert.equal(trialRenewal(p, "en"), null);
  }
});

test("renewal sentence shows the price and never says free for the saving", () => {
  const year = { period: "year", displayPrice: "₺2.999,99", trialDays: 7 };
  assert.match(trialRenewal(year, "tr"), /₺2\.999,99\/yıl/);
  assert.match(trialRenewal(year, "en"), /7 days/);
  assert.doesNotMatch(trialRenewal(year, "tr"), /bedava/i);
});
