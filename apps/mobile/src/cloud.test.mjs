// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_MOTION_ENABLED,
  CONSENT_VERSION,
  CloudError,
  SCENE_CROP,
  SCENE_STYLES,
  cloudErrorText,
  consentRecord,
  errorFromResponse,
  hasValidConsent,
  normalizeBaseUrl,
  parseQuota,
  parseSceneResponse,
  productPlacement,
  remaining,
  stylesFor,
} from "./cloud-rules.ts";

const quota = {
  plan: "pro",
  images: { used: 3, limit: 12 },
  resetsAt: "2026-11-17T00:00:00.000Z",
};
const jpeg = "/9j/" + "A".repeat(200);

test("base URL must be https and loses trailing slashes", () => {
  assert.equal(normalizeBaseUrl(undefined), null);
  assert.equal(normalizeBaseUrl(""), null);
  assert.equal(normalizeBaseUrl("http://x.workers.dev"), null);
  assert.equal(
    normalizeBaseUrl(" https://vidora-cloud.x.workers.dev/ "),
    "https://vidora-cloud.x.workers.dev",
  );
});

test("cloud motion stays off (owner decision: no paid providers)", () => {
  assert.equal(CLOUD_MOTION_ENABLED, false);
});

test("styles: 10 unique ids, up to 8 shown, category fits first", () => {
  const ids = SCENE_STYLES.map((s) => s.id);
  assert.equal(new Set(ids).size, 10);
  assert.equal(stylesFor(null).length, 8);
  const food = stylesFor("food");
  assert.equal(food.length, 8);
  assert.ok(food.slice(0, 3).every((s) => s.fits.includes("food")));
  assert.ok(SCENE_STYLES.every((s) => s.tr && s.en));
});

test("style ids match the worker's prompts", async () => {
  const { SCENE_PROMPTS } = await import("../../../cloud/worker/src/styles.ts");
  assert.deepEqual(
    SCENE_STYLES.map((s) => s.id).sort(),
    Object.keys(SCENE_PROMPTS).sort(),
  );
});

test("product placement: fits 64% × 50%, centred, base at 78%", () => {
  for (const [w, h] of [
    [400, 600],
    [1200, 300],
    [300, 1500],
    [0, 0],
  ]) {
    const r = productPlacement(w, h);
    assert.ok(r.width <= 0.6401 && r.height <= 0.5001, `${w}x${h}`);
    assert.ok(Math.abs(r.x + r.width / 2 - 0.5) < 1e-9);
    assert.ok(Math.abs(r.y + r.height - 0.78) < 1e-9);
    assert.ok(r.x >= 0 && r.y >= 0);
    // Aspect ratio is kept inside the 9:16 frame.
    if (w && h)
      assert.ok(Math.abs((r.width * 9) / (r.height * 16) - w / h) < 1e-6);
  }
  assert.ok(Math.abs(SCENE_CROP.width - 9 / 16) < 1e-9);
  assert.ok(Math.abs(SCENE_CROP.x * 2 + SCENE_CROP.width - 1) < 1e-9);
});

test("quota parsing and remaining", () => {
  const parsed = parseQuota(quota);
  assert.deepEqual(parsed, quota);
  assert.equal(remaining(parsed), 9);
  assert.equal(parseQuota({ images: { used: -1, limit: 2 } }), null);
  assert.equal(parseQuota(null), null);
});

test("scene responses keep only base64 images", () => {
  const result = parseSceneResponse({
    images: [
      { data: jpeg, mime: "image/jpeg" },
      { data: "<script>" + "x".repeat(200) },
      { data: "short" },
      { nope: true },
    ],
    quota,
  });
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].mime, "image/jpeg");
  assert.equal(result.quota.images.used, 3);
  assert.equal(parseSceneResponse({ images: [] }), null);
  assert.equal(parseSceneResponse(null), null);
});

test("worker errors map to app codes with copy in both languages", () => {
  const exceeded = errorFromResponse(429, {
    error: { code: "quota-exceeded" },
    quota,
  });
  assert.ok(exceeded instanceof CloudError);
  assert.equal(exceeded.code, "quota-exceeded");
  assert.equal(exceeded.quota.images.limit, 12);
  const free = errorFromResponse(429, { error: { code: "daily_free_quota" } });
  assert.equal(free.code, "daily-free-quota");
  assert.equal(
    cloudErrorText(free.code).tr,
    "Bugünkü yapay zekâ kotası doldu, yarın tekrar dene.",
  );
  const map = (status, code) =>
    errorFromResponse(status, { error: { code } }).code;
  assert.equal(map(403, "subscription-expired"), "not-pro");
  assert.equal(map(401, "invalid-transaction"), "subscription");
  assert.equal(map(501, "feature-disabled"), "not-configured");
  assert.equal(map(502, "upstream-failed"), "upstream-failed");
  assert.equal(errorFromResponse(500, null).code, "failed");
  assert.equal(errorFromResponse(429, "<html>").code, "rate-limited");
  for (const code of [
    "not-configured",
    "not-pro",
    "consent-required",
    "offline",
    "quota-exceeded",
    "daily-free-quota",
    "rate-limited",
    "subscription",
    "upstream-failed",
    "failed",
  ]) {
    const text = cloudErrorText(code);
    assert.ok(text.tr.length > 10 && text.en.length > 10, code);
  }
});

test("consent is versioned", () => {
  assert.equal(hasValidConsent(null), false);
  assert.equal(hasValidConsent("garbage"), false);
  assert.equal(
    hasValidConsent(JSON.stringify({ version: CONSENT_VERSION - 1 })),
    false,
  );
  assert.equal(hasValidConsent(consentRecord(Date.now())), true);
});
