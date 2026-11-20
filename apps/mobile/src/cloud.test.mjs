// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_MOTION_ENABLED,
  CONSENT_VERSION,
  CloudError,
  FULL_CROP,
  SCENE_CROP,
  SCENE_RATIOS,
  SCENE_STYLES,
  STYLE_ORDER,
  buildMultipart,
  cloudErrorText,
  consentRecord,
  cropFor,
  errorFromResponse,
  hasValidConsent,
  localClock,
  multipartContentType,
  normalizeBaseUrl,
  parseQuota,
  productPlacement,
  quotaFromHeaders,
  remaining,
  stylesFor,
  isModelStyle,
} from "./cloud-rules.ts";
import { collectScenes, postForJpeg } from "./cloud-net.ts";

const quota = {
  plan: "pro",
  images: { used: 3, limit: 12 },
  resetsAt: "2026-11-17T00:00:00.000Z",
};

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

test("styles: 10 unique ids, names in both languages, category order first", () => {
  const ids = SCENE_STYLES.map((s) => s.id);
  assert.equal(new Set(ids).size, 10);
  assert.equal(stylesFor(null).length, 8);
  assert.ok(SCENE_STYLES.every((s) => s.tr && s.en));
  for (const [category, order] of Object.entries(STYLE_ORDER)) {
    const list = stylesFor(category);
    const expected = category === "fashion" ? 10 : 8;
    assert.equal(list.length, expected, category);
    assert.equal(new Set(list.map((s) => s.id)).size, expected, category);
    assert.deepEqual(
      list.slice(0, order.length).map((s) => s.id),
      [...order],
      category,
    );
    assert.ok(order.every((id) => ids.includes(id)), category);
  }
  assert.equal(stylesFor("food")[0].id, "kitchen-oak");
  assert.equal(stylesFor("jewellery")[0].id, "luxury-velvet");
  assert.equal(stylesFor("food", 3).length, 3);
});

test("style ids match the worker's photo styles", async () => {
  const { PRODUCT_STYLES } = await import(
    "../../../cloud/worker/src/styles.ts"
  );
  assert.deepEqual(
    SCENE_STYLES.map((s) => s.id).sort(),
    Object.keys(PRODUCT_STYLES).sort(),
  );
  assert.deepEqual(SCENE_RATIOS.map((r) => r.id).sort(), ["1:1", "4:5", "9:16"]);
});

test("crop: whole image for 9:16, centre 9:16 column otherwise", () => {
  assert.deepEqual(cropFor("9:16"), FULL_CROP);
  // Square image: the same column the old square scenes used.
  assert.ok(Math.abs(cropFor("1:1").width - SCENE_CROP.width) < 1e-9);
  assert.ok(Math.abs(cropFor("1:1").x - SCENE_CROP.x) < 1e-9);
  // 4:5 image (0.8): 0.5625 / 0.8 of its width, centred.
  const c = cropFor("4:5");
  assert.ok(Math.abs(c.width - 0.703125) < 1e-9);
  assert.ok(Math.abs(c.x * 2 + c.width - 1) < 1e-9);
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

test("quota headers of a scene answer", () => {
  const headers = {
    "X-Quota-Used": "4",
    "X-Quota-Limit": "12",
    "X-Quota-Resets-At": "2026-11-21T00:00:00.000Z",
  };
  const get = (name) => headers[name] ?? null;
  const parsed = quotaFromHeaders(get);
  assert.equal(parsed.images.used, 4);
  assert.equal(parsed.images.limit, 12);
  assert.equal(parsed.resetsAt, "2026-11-21T00:00:00.000Z");
  assert.equal(remaining(parsed), 8);
  assert.equal(quotaFromHeaders(() => null), null);
  assert.equal(
    quotaFromHeaders((n) => (n === "X-Quota-Used" ? "x" : "12")),
    null,
  );
});

test("multipart body: boundary, part headers, file bytes and exact length", () => {
  const boundary = "vidoraTESTBOUNDARY123";
  const data = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x0d, 0x0a, 0x42]);
  const body = buildMultipart(
    { style: "spa-slate", ratio: "9:16" },
    { name: "photo", filename: "product.jpg", contentType: "image/jpeg", data },
    boundary,
  );
  assert.ok(body instanceof Uint8Array);
  assert.equal(
    multipartContentType(boundary),
    "multipart/form-data; boundary=vidoraTESTBOUNDARY123",
  );
  const text = Buffer.from(body).toString("latin1");
  const expectedHead =
    `--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\nspa-slate\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="ratio"\r\n\r\n9:16\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="product.jpg"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`;
  const expectedTail = `\r\n--${boundary}--\r\n`;
  assert.ok(text.startsWith(expectedHead));
  assert.ok(text.endsWith(expectedTail));
  // The file bytes sit unchanged between head and tail.
  const start = expectedHead.length;
  assert.deepEqual([...body.slice(start, start + data.length)], [...data]);
  // Content-Length the caller sends is exactly the body length.
  assert.equal(body.length, expectedHead.length + data.length + expectedTail.length);
  // The exact length also holds for a large photo.
  const big = buildMultipart(
    { style: "spa-slate", ratio: "1:1" },
    {
      name: "photo",
      filename: "product.jpg",
      contentType: "image/jpeg",
      data: new Uint8Array(1_400_000).fill(7),
    },
    boundary,
  );
  assert.ok(big.length > 1_400_000 && big.length < 1_400_700);
});

test("multipart rejects an unsafe boundary and strips quotes from names", () => {
  const file = {
    name: 'ph"oto',
    filename: 'a"\r\nb.jpg',
    contentType: "image/jpeg",
    data: new Uint8Array(1),
  };
  assert.throws(() => buildMultipart({}, file, "bad boundary\r\n"));
  assert.throws(() => buildMultipart({}, file, "short"));
  const text = Buffer.from(
    buildMultipart({}, file, "vidoraTESTBOUNDARY123"),
  ).toString("latin1");
  assert.match(text, /name="photo"; filename="ab\.jpg"/);
});

test("local clock reads the instant in local time", () => {
  const iso = "2026-11-21T00:00:00.000Z";
  const d = new Date(iso);
  const expected =
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0");
  assert.equal(localClock(iso), expected);
  assert.equal(localClock(""), null);
  assert.equal(localClock("nope"), null);
  assert.equal(localClock(null), null);
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
  const resets = "2026-11-21T00:00:00.000Z";
  const clock = localClock(resets);
  assert.equal(
    errorFromResponse(
      429,
      { error: { code: "quota-exceeded" }, quota },
      () => null,
    ).resetsAt,
    quota.resetsAt,
  );
  assert.equal(
    errorFromResponse(
      429,
      { error: { code: "daily_free_quota" } },
      (n) => (n === "X-Quota-Resets-At" ? resets : null),
    ).resetsAt,
    resets,
  );
  for (const code of ["quota-exceeded", "daily-free-quota"]) {
    const text = cloudErrorText(code, resets);
    assert.match(text.tr, /Yarın tekrar dene/);
    assert.ok(text.tr.includes(clock) && text.en.includes(clock), code);
    assert.match(text.tr, /Şablonlar çalışmaya devam eder/);
    assert.match(text.en, /Templates keep working/);
    // Without a time the advice stays.
    assert.match(cloudErrorText(code).tr, /Yarın tekrar dene/);
  }
  const map = (status, code) =>
    errorFromResponse(status, { error: { code } }).code;
  assert.equal(map(403, "subscription-expired"), "not-pro");
  assert.equal(map(401, "invalid-transaction"), "subscription");
  assert.equal(map(501, "feature-disabled"), "not-configured");
  assert.equal(map(502, "upstream-failed"), "upstream-failed");
  assert.equal(map(413, "photo-too-large"), "photo-too-large");
  assert.equal(map(400, "bad-photo"), "bad-photo");
  assert.equal(map(400, "bad-style"), "bad-style");
  assert.equal(map(411, "length-required"), "length-required");
  assert.equal(map(401, "unauthorized"), "not-pro");
  assert.equal(map(411, ""), "length-required");
  assert.equal(map(413, ""), "photo-too-large");
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
    "photo-too-large",
    "bad-photo",
    "bad-style",
    "length-required",
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

const okJpeg = () => {
  const bytes = new Uint8Array(2000);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
};
const okResponse = (used) => ({
  ok: true,
  status: 200,
  headers: {
    get: (n) =>
      ({ "X-Quota-Used": String(used), "X-Quota-Limit": "12" })[n] ?? null,
  },
  arrayBuffer: async () => okJpeg().buffer,
});

test("two scenes: second fails -> first kept, error and its quota returned", async () => {
  const failQuota = { ...quota, images: { used: 12, limit: 12 } };
  const result = await collectScenes(2, async (i) => {
    if (i === 0) return { item: "a", quota: quota };
    throw new CloudError("quota-exceeded", failQuota);
  });
  assert.deepEqual(result.scenes, ["a"]);
  assert.equal(result.error.code, "quota-exceeded");
  assert.equal(result.quota.images.used, 12);
  // Without a quota on the error, the last good one stays.
  const plain = await collectScenes(2, async (i) => {
    if (i === 0) return { item: "a", quota };
    throw new Error("boom");
  });
  assert.equal(plain.error.code, "failed");
  assert.equal(plain.quota.images.used, 3);
  // First failure throws; success has no error.
  await assert.rejects(
    collectScenes(2, async () => {
      throw new CloudError("offline");
    }),
    (e) => e.code === "offline",
  );
  const all = await collectScenes(2, async (i) => ({ item: i, quota }));
  assert.equal(all.scenes.length, 2);
  assert.equal(all.error, undefined);
});

test("post: success returns JPEG and quota; error body maps to a code", async () => {
  const ok = await postForJpeg(async () => okResponse(5), "https://x", {}, 1000);
  assert.equal(ok.jpeg.length, 2000);
  assert.equal(ok.quota.images.used, 5);
  await assert.rejects(
    postForJpeg(
      async () => ({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({ error: { code: "daily_free_quota" } }),
      }),
      "https://x",
      {},
      1000,
    ),
    (e) => e.code === "daily-free-quota",
  );
  await assert.rejects(
    postForJpeg(async () => { throw new TypeError("net"); }, "https://x", {}, 1000),
    (e) => e.code === "offline",
  );
});

test("post: a body that never arrives times out as upstream-failed", async () => {
  const hanging = async (_url, init) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: () =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  });
  await assert.rejects(
    postForJpeg(hanging, "https://x", {}, 30),
    (e) => e.code === "upstream-failed",
  );
  // Even a body that ignores the abort signal cannot hang the call.
  const stuck = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: () => new Promise(() => {}),
  });
  await assert.rejects(
    postForJpeg(stuck, "https://x", {}, 30),
    (e) => e.code === "upstream-failed",
  );
  // A fetch that never answers too.
  await assert.rejects(
    postForJpeg(() => new Promise(() => {}), "https://x", {}, 30),
    (e) => e.code === "upstream-failed",
  );
});

test("model styles are offered for clothing only, first there", () => {
  const models = ["model-studio", "model-street"];
  assert.ok(models.every(isModelStyle));
  assert.equal(isModelStyle("spa-slate"), false);
  const fashion = stylesFor("fashion").map((s) => s.id);
  assert.deepEqual(fashion.slice(0, 2), models);
  for (const category of [null, undefined, "cosmetics", "jewellery", "home", "food", "electronics"]) {
    const ids = stylesFor(category).map((s) => s.id);
    assert.ok(models.every((m) => !ids.includes(m)), String(category));
    if (category) assert.ok(models.every((m) => !STYLE_ORDER[category].includes(m)));
  }
  const model = SCENE_STYLES.find((s) => s.id === "model-street");
  assert.equal(model.tr, "Manken · sokak");
  assert.equal(model.en, "Model · street");
});
