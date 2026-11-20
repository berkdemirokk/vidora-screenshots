// Marketplace listing text (G10): parsing the on-device model's answer and
// deciding which languages the sheet offers.
// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

// product.ts pulls in expo modules; in node they resolve to stand-ins and
// the native module is missing, like an older build.
await import("./test-support/register.mjs");
const {
  parseListing,
  normalizeAvailability,
  listingLanguages,
  hasListing,
  listingAvailability,
  writeListing,
  translateListing,
  flattenListing,
  rebuildListing,
} = await import("./listing.ts");

const VALID = JSON.stringify({
  title: "  Amber cam şişe, 100 ml  ",
  description: "Işığı kesen amber cam. Seyahat için hafif.",
  bullets: ["Amber cam", "100 ml", "Damlalıklı kapak"],
  keywords: ["amber şişe", "cam şişe", "damlalık"],
});

test("valid JSON is read and trimmed", () => {
  const listing = parseListing(VALID);
  assert.deepEqual(listing, {
    title: "Amber cam şişe, 100 ml",
    description: "Işığı kesen amber cam. Seyahat için hafif.",
    bullets: ["Amber cam", "100 ml", "Damlalıklı kapak"],
    keywords: ["amber şişe", "cam şişe", "damlalık"],
  });
});

test("JSON wrapped in prose or a code fence is found", () => {
  const prose = "İşte ilan metnin:\n```json\n" + VALID + "\n```\nBaşarılar!";
  assert.equal(parseListing(prose)?.title, "Amber cam şişe, 100 ml");
  // Braces inside strings do not end the object early.
  const tricky =
    'Sure: {"title": "Set {3 parça}", "description": "a } b", "bullets": [], "keywords": []} done';
  assert.equal(parseListing(tricky)?.title, "Set {3 parça}");
  // A trailing comma is forgiven.
  assert.equal(
    parseListing('{"title": "Kupa", "bullets": ["A",], "keywords": [],}')
      ?.bullets[0],
    "A",
  );
});

test("limits: title 100 chars, 5 bullets, 15 keywords", () => {
  const listing = parseListing(
    JSON.stringify({
      title: "x".repeat(140),
      description: "d",
      bullets: ["1", "2", "3", "4", "5", "6", "7"],
      keywords: Array.from({ length: 20 }, (_, i) => "kelime" + i),
    }),
  );
  assert.ok(listing);
  assert.ok(listing.title.length <= 100);
  assert.equal(listing.bullets.length, 5);
  assert.equal(listing.keywords.length, 15);
});

test("bullets and keywords are cleaned and de-duplicated", () => {
  const listing = parseListing(
    JSON.stringify({
      title: "Kupa",
      description: "",
      bullets: [
        "- Seramik",
        "• Seramik",
        "  ",
        7,
        "Bulaşık makinesinde yıkanır",
      ],
      keywords: "#kupa, Kupa, seramik kupa, ,hediye",
    }),
  );
  assert.deepEqual(listing?.bullets, [
    "Seramik",
    "Bulaşık makinesinde yıkanır",
  ]);
  assert.deepEqual(listing?.keywords, ["kupa", "seramik kupa", "hediye"]);
});

test("garbage, empty title and non-objects give null", () => {
  assert.equal(parseListing("Üzgünüm, yardımcı olamam."), null);
  assert.equal(parseListing(""), null);
  assert.equal(parseListing("{not json"), null);
  assert.equal(parseListing('{"title": "   ", "bullets": []}'), null);
  assert.equal(parseListing('["title"]'), null);
  assert.equal(parseListing('{"title": 5}'), null);
});

test("no Apple Intelligence: nothing is offered (button hidden)", () => {
  // Translation alone is useless: there is no text to translate.
  const none = normalizeAvailability({ write: [], translate: ["en", "de"] });
  assert.deepEqual(none, { write: [], translate: [] });
  assert.equal(hasListing(none), false);
  assert.deepEqual(listingLanguages(none), []);
  // Malformed answers from the native side count as unavailable.
  for (const raw of [null, undefined, "x", 3, { write: "tr" }, {}])
    assert.equal(hasListing(normalizeAvailability(raw)), false);
});

test("write languages first, then translate targets without repeats", () => {
  const av = normalizeAvailability({
    write: ["en", "tr", "xx", "tr"],
    translate: ["en", "ar", "de", "zz", "ru"],
  });
  assert.deepEqual(av, { write: ["tr", "en"], translate: ["de", "ar", "ru"] });
  assert.equal(hasListing(av), true);
  assert.deepEqual(listingLanguages(av), [
    { lang: "tr", kind: "write" },
    { lang: "en", kind: "write" },
    { lang: "de", kind: "translate" },
    { lang: "ar", kind: "translate" },
    { lang: "ru", kind: "translate" },
  ]);
});

test("an older build without the native functions is unavailable, never a crash", async () => {
  assert.deepEqual(await listingAvailability(), { write: [], translate: [] });
  assert.equal(
    await writeListing({
      name: "Kupa",
      category: "home",
      price: "199 TL",
      lang: "tr",
    }),
    null,
  );
  const listing = parseListing(VALID);
  assert.equal(await translateListing(listing, "en", "tr"), null);
});

test("translation round trip keeps the shape and the limits", () => {
  const listing = parseListing(VALID);
  const flat = flattenListing(listing);
  assert.equal(flat.length, 2 + 3 + 3);
  const translated = flat.map((s) => s.toUpperCase());
  const back = rebuildListing(listing, translated);
  assert.equal(back?.title, "AMBER CAM ŞIŞE, 100 ML");
  assert.equal(back?.bullets.length, 3);
  assert.equal(back?.keywords.length, 3);
  // A wrong count from the native side is refused.
  assert.equal(rebuildListing(listing, translated.slice(1)), null);
});
