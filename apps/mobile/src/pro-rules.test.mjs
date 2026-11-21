// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FREE_DAILY_EXPORTS,
  NO_ENTITLEMENT,
  exportPlan,
  freeExportsLeft,
  freeIntent,
  isProCaptionStyle,
  isProQuality,
  localDay,
  needsPaywall,
  parseEntitlement,
  parseProducts,
  parseQuota,
  yearlySaving,
  bestValueId,
  formatMoney,
  parsePurchaseStatus,
  proOnlyOptions,
  recordFreeExport,
  storeProblem,
} from "./pro-rules.ts";

const weekly = "com.berkdemirok.vidora.pro.weekly";
const yearly = "com.berkdemirok.vidora.pro.yearly";
const ids = [yearly, weekly];

test("only 720p and the classic style are free", () => {
  assert.equal(isProQuality("720p"), false);
  assert.equal(isProQuality("1080p"), true);
  assert.equal(isProCaptionStyle("classic"), false);
  assert.equal(isProCaptionStyle("highlight"), true);
  assert.equal(isProCaptionStyle("pop"), true);
});

test("proOnlyOptions lists what an intent relies on", () => {
  assert.deepEqual(
    proOnlyOptions({ quality: "720p", captionStyle: "classic" }),
    [],
  );
  assert.deepEqual(proOnlyOptions({ quality: "720p", captionStyle: null }), []);
  assert.deepEqual(proOnlyOptions({ quality: "1080p", captionStyle: "pop" }), [
    "quality",
    "captionStyle",
  ]);
  assert.deepEqual(proOnlyOptions({ quality: "1080p", captionStyle: null }), [
    "quality",
  ]);
});

test("the paywall appears only for free users with a Pro option active", () => {
  const pro = { quality: "1080p", captionStyle: "highlight" };
  const free = { quality: "720p", captionStyle: "classic" };
  assert.equal(needsPaywall(false, pro), true);
  assert.equal(
    needsPaywall(false, { quality: "720p", captionStyle: "pop" }),
    true,
  );
  assert.equal(needsPaywall(false, free), false);
  assert.equal(needsPaywall(true, pro), false);
  assert.equal(needsPaywall(true, free), false);
});

test("a caption style that is not burned in never triggers the paywall", () => {
  assert.equal(
    needsPaywall(false, { quality: "720p", captionStyle: null }),
    false,
  );
});

test("freeIntent downgrades to free settings and keeps captions off when off", () => {
  assert.deepEqual(freeIntent({ quality: "1080p", captionStyle: "pop" }), {
    quality: "720p",
    captionStyle: "classic",
  });
  assert.deepEqual(freeIntent({ quality: "1080p", captionStyle: null }), {
    quality: "720p",
    captionStyle: null,
  });
});

test("exportPlan: Pro keeps the intent without watermark", () => {
  assert.deepEqual(
    exportPlan(true, { quality: "1080p", captionStyle: "pop" }),
    {
      quality: "1080p",
      captionStyle: "pop",
      watermark: false,
    },
  );
  assert.deepEqual(exportPlan(true, { quality: "720p", captionStyle: null }), {
    quality: "720p",
    captionStyle: null,
    watermark: false,
  });
});

test("exportPlan: free is always watermarked and limited", () => {
  assert.deepEqual(
    exportPlan(false, { quality: "1080p", captionStyle: "pop" }),
    {
      quality: "720p",
      captionStyle: "classic",
      watermark: true,
    },
  );
  assert.equal(
    exportPlan(false, { quality: "720p", captionStyle: "classic" }).watermark,
    true,
  );
});

test("parseEntitlement accepts only an explicit active: true", () => {
  assert.deepEqual(
    parseEntitlement({ active: true, productId: yearly, expires: 123 }),
    { active: true, productId: yearly, expires: 123 },
  );
  assert.deepEqual(parseEntitlement({ active: true }), {
    active: true,
    productId: null,
    expires: null,
  });
  for (const bad of [
    null,
    undefined,
    "true",
    [],
    { active: "true" },
    { active: 1 },
    { active: false, productId: yearly, expires: 5 },
  ])
    assert.deepEqual(parseEntitlement(bad), NO_ENTITLEMENT);
});

test("parseProducts keeps known, priced products in the requested order", () => {
  const raw = [
    {
      id: weekly,
      displayName: "Weekly",
      displayPrice: "₺49,99",
      period: "week",
      hasTrial: false,
      trialDays: 0,
    },
    {
      id: yearly,
      displayName: "Yearly",
      displayPrice: "₺599,99",
      period: "year",
      hasTrial: true,
      trialDays: 3.9,
    },
    { id: "other.product", displayPrice: "$1", period: "month" },
    { id: weekly, displayPrice: "duplicate" },
    null,
  ];
  const products = parseProducts(raw, ids);
  assert.deepEqual(
    products.map((product) => product.id),
    [yearly, weekly],
  );
  assert.equal(products[0].displayPrice, "₺599,99");
  assert.equal(products[0].hasTrial, true);
  assert.equal(products[0].trialDays, 3);
  assert.equal(products[1].displayPrice, "₺49,99");
});

test("parseProducts drops entries without a store price and odd shapes", () => {
  assert.deepEqual(parseProducts(null, ids), []);
  assert.deepEqual(parseProducts({}, ids), []);
  assert.deepEqual(parseProducts([{ id: weekly, displayPrice: " " }], ids), []);
  assert.deepEqual(parseProducts([{ id: weekly }], ids), []);
  const [product] = parseProducts(
    [{ id: weekly, displayPrice: "$2.99", period: "decade", hasTrial: "yes" }],
    ids,
  );
  assert.deepEqual(product, {
    id: weekly,
    displayName: "",
    displayPrice: "$2.99",
    price: null,
    currencyCode: null,
    priceLocale: null,
    period: "",
    hasTrial: false,
    trialDays: 0,
  });
});

test("parsePurchaseStatus never guesses a purchase", () => {
  assert.equal(parsePurchaseStatus({ status: "purchased" }), "purchased");
  assert.equal(parsePurchaseStatus({ status: "cancelled" }), "cancelled");
  assert.equal(parsePurchaseStatus({ status: "pending" }), "pending");
  assert.equal(parsePurchaseStatus({ status: "weird" }), "pending");
  assert.equal(parsePurchaseStatus(undefined), "pending");
});

test("storeProblem reads the native error markers", () => {
  assert.equal(
    storeProblem(new Error("store-unverified: bad jws")),
    "unverified",
  );
  assert.equal(
    storeProblem("Error: store-unavailable: no network"),
    "unavailable",
  );
  assert.equal(storeProblem(new Error("boom")), "other");
});

test("free daily export quota resets each local day", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(freeExportsLeft(null, "2026-01-05"), FREE_DAILY_EXPORTS);
  let quota = null;
  for (let i = 0; i < FREE_DAILY_EXPORTS; i++)
    quota = recordFreeExport(quota, "2026-01-05");
  assert.equal(freeExportsLeft(quota, "2026-01-05"), 0);
  assert.equal(freeExportsLeft(quota, "2026-01-06"), FREE_DAILY_EXPORTS);
  assert.deepEqual(recordFreeExport(quota, "2026-01-06"), {
    day: "2026-01-06",
    count: 1,
  });
  assert.equal(parseQuota({ day: "x", count: 1 }), null);
  assert.equal(parseQuota({ day: "2026-01-05", count: -1 }), null);
  assert.deepEqual(parseQuota({ day: "2026-01-05", count: 2 }), {
    day: "2026-01-05",
    count: 2,
  });
});

test("there are no free renders", async () => {
  const { FREE_RENDERS } = await import("./pro-rules.ts");
  assert.equal(FREE_RENDERS, false);
});

const plan = (id, period, price, currencyCode = "TRY") => ({
  id,
  displayName: "",
  displayPrice: String(price),
  price,
  currencyCode,
  priceLocale: "tr_TR",
  period,
  hasTrial: false,
  trialDays: 0,
});

test("parseProducts keeps a numeric price and currency only when valid", () => {
  const [good, bad] = parseProducts(
    [
      {
        id: yearly,
        displayPrice: "₺43.199,99",
        price: 43199.99,
        currencyCode: "TRY",
        priceLocale: "tr_TR",
        period: "year",
      },
      {
        id: weekly,
        displayPrice: "₺1.199,99",
        price: "1199.99",
        currencyCode: "try",
        period: "week",
      },
    ],
    ids,
  );
  assert.equal(good.price, 43199.99);
  assert.equal(good.currencyCode, "TRY");
  assert.equal(good.priceLocale, "tr_TR");
  assert.equal(bad.price, null);
  assert.equal(bad.currencyCode, null);
  assert.equal(bad.priceLocale, null);
});

test("yearlySaving compares the yearly plan with 12 monthly payments", () => {
  const saving = yearlySaving([
    plan(yearly, "year", 43199.99),
    plan("m", "month", 4799.99),
  ]);
  assert.ok(saving);
  assert.equal(saving.twelveMonths, 57599.88);
  assert.equal(saving.perMonth, 3600);
  // The exact difference, never rounded into "months".
  assert.equal(saving.saved, 14399.89);
  // perMonth is rounded up to the cent.
  assert.equal(
    yearlySaving([plan(yearly, "year", 100), plan("m", "month", 10)])?.perMonth,
    8.34,
  );
  assert.equal(saving.currencyCode, "TRY");
});

test("yearlySaving shows nothing without prices or a real saving", () => {
  assert.equal(yearlySaving([plan(yearly, "year", 43199.99)]), null);
  assert.equal(
    yearlySaving([plan(yearly, "year", null), plan("m", "month", 4799.99)]),
    null,
  );
  assert.equal(
    yearlySaving([plan(yearly, "year", 60000), plan("m", "month", 4799.99)]),
    null,
  );
  assert.equal(
    yearlySaving([
      plan(yearly, "year", 400, "USD"),
      plan("m", "month", 40, "EUR"),
    ]),
    null,
  );
});

test("formatMoney writes the store currency", () => {
  const text = formatMoney(3600, "TRY", "tr_TR");
  assert.ok(text === null || /3\.600/.test(text), String(text));
});

test("bestValueId tags the strictly cheapest plan per day", () => {
  const products = [
    plan(yearly, "year", 43199.99),
    plan("m", "month", 4799.99),
    plan("w", "week", 1199.99),
  ];
  assert.equal(bestValueId(products), yearly);
});

test("bestValueId shows no tag without a fair comparison", () => {
  assert.equal(bestValueId([plan(yearly, "year", 43199.99)]), null);
  assert.equal(
    bestValueId([plan(yearly, "year", null), plan("m", "month", 4799.99)]),
    null,
  );
  assert.equal(
    bestValueId([
      plan(yearly, "year", 400, "USD"),
      plan("m", "month", 40, "EUR"),
    ]),
    null,
  );
  assert.equal(
    bestValueId([plan(yearly, "year", 0), plan("m", "month", 4799.99)]),
    null,
  );
  // 365 days at 365 vs 7 days at 7: the same per day, so no winner.
  assert.equal(
    bestValueId([plan(yearly, "year", 365), plan("w", "week", 7)]),
    null,
  );
});

// Source guards for the store fixes waiting for the 1.2.0 build (Swift is
// not compiled here): the purchase errors must reach JS as markers that
// storeProblem / parsePurchaseStatus already understand.
const storeSwift = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../modules/karevia-editor/ios/KareviaStoreModule.swift",
  ),
  "utf8",
);
const purchaseBody = storeSwift.slice(
  storeSwift.indexOf('AsyncFunction("purchase")'),
  storeSwift.indexOf('AsyncFunction("entitlement")'),
);

test("purchase maps StoreKit errors to statuses and markers JS knows", () => {
  assert.match(
    purchaseBody,
    /catch StoreKitError\.userCancelled \{[^}]*return \["status": "cancelled"\]/,
  );
  for (const pattern of [
    /catch StoreKitError\.networkError\(_\) \{\s*throw StoreFailure\.unavailable/,
    /catch StoreKitError\.notAvailableInStorefront \{\s*throw StoreFailure\.unavailable/,
    /catch is StoreKit\.Product\.PurchaseError \{[^}]*throw StoreFailure\.unavailable/,
  ])
    assert.match(purchaseBody, pattern);
  // Ask to Buy stays a pending status.
  assert.match(purchaseBody, /case \.pending:[^}]*return \["status": "pending"\]/);
  assert.equal(parsePurchaseStatus({ status: "cancelled" }), "cancelled");
  const unavailable = storeSwift.match(
    /case \.unavailable: return "([^"]+)"/,
  );
  assert.ok(unavailable);
  assert.equal(storeProblem(new Error(unavailable[1])), "unavailable");
});

test("billing grace period counts as active, billing retry does not", () => {
  assert.match(storeSwift, /SubscriptionInfo\.status\(for: groupID\)/);
  assert.match(storeSwift, /status\.state == \.inGracePeriod/);
  assert.doesNotMatch(storeSwift, /inBillingRetryPeriod/);
  // Both expiry checks (entitlement and cloud proof) consult it.
  assert.equal(
    storeSwift.match(/await storeInGracePeriod\(transaction\)/g)?.length,
    2,
  );
});
