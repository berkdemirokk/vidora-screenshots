// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORIES,
  VIDEO_KINDS,
  bankSuggestions,
  parseCopySuggestions,
  seasonalBadges,
  seasonalSets,
} from "./product-catalog.ts";
import {
  PALETTES,
  TEMPLATES,
  buildSpec,
  specProblems,
} from "./product-templates.ts";

test("every category points at a real palette and template", () => {
  for (const c of CATEGORIES) {
    assert.ok(
      PALETTES.some((p) => p.id === c.palette),
      c.id,
    );
    assert.ok(
      TEMPLATES.some((t) => t.id === c.template),
      c.id,
    );
    for (const lang of ["tr", "en"]) {
      const bank = bankSuggestions(c.id, lang);
      assert.ok(bank.headlines.length >= 3 && bank.ctas.length >= 3);
      assert.ok(bank.headlines.every((h) => h.length <= 40));
      assert.ok(bank.ctas.every((h) => h.length <= 28));
      assert.ok(bank.badges.every((b) => b.length >= 2 && b.length <= 18));
      for (const list of [bank.headlines, bank.ctas, bank.badges])
        assert.equal(new Set(list).size, list.length, c.id + " repeats");
    }
  }
});

test("every template belongs to a known Trendyol video type", () => {
  for (const t of TEMPLATES)
    assert.ok(
      VIDEO_KINDS.some((k) => k.id === t.kind),
      t.id,
    );
});

test("bank copy fits every template", () => {
  for (const c of CATEGORIES)
    for (const t of TEMPLATES) {
      const bank = bankSuggestions(c.id, "tr");
      const spec = buildSpec({
        template: t.id,
        palette: c.palette,
        product: "file:///tmp/p.png",
        headline: bank.headlines[0],
        price: "999 TL",
        badge: bank.badges[0],
        cta: bank.ctas[0],
        store: "Atölye Nur",
        quality: "720p",
        bitrate: "compact",
        watermark: true,
        music: null,
      });
      assert.deepEqual(specProblems(spec), [], c.id + "/" + t.id);
    }
});

test("store template shows the store name in Turkish upper case", () => {
  const spec = buildSpec({
    template: "store",
    palette: "ivory",
    product: "file:///tmp/p.png",
    headline: "",
    price: "",
    badge: "",
    cta: "",
    store: "atölye nil",
    quality: "720p",
    watermark: false,
    music: null,
  });
  assert.deepEqual(
    spec.texts.map((x) => x.text),
    ["ATÖLYE NİL"],
  );
  assert.equal(spec.bitrate, "high");
});

test("model output is parsed, cleaned and capped", () => {
  const text = [
    "Elbette! İşte öneriler:",
    "B: Işıltını tamamla",
    'B: "Gün boyu kalıcı"',
    "- B: 3. İmza kokun",
    "B: Dördüncü başlık",
    "B: " + "x".repeat(60),
    "Ç: Hemen sipariş ver",
    "C: hemen sipariş ver",
    "Ç: Sepete ekle",
  ].join("\n");
  assert.deepEqual(parseCopySuggestions(text), {
    headlines: ["Işıltını tamamla", "Gün boyu kalıcı", "İmza kokun"],
    ctas: ["Hemen sipariş ver", "Sepete ekle"],
  });
});

test("garbage model output gives nothing", () => {
  assert.deepEqual(parseCopySuggestions("Üzgünüm, yardımcı olamam."), {
    headlines: [],
    ctas: [],
  });
});

test("seasonal badges follow the calendar", () => {
  const on = (y, m, d, lang = "tr") =>
    seasonalBadges(new Date(y, m - 1, d), lang);
  assert.deepEqual(on(2026, 11, 16), ["Kasım fırsatı", "Öğretmenler Günü"]);
  assert.deepEqual(on(2026, 11, 16, "en"), ["Black Friday"]);
  assert.deepEqual(on(2026, 12, 20), ["Yılbaşına özel"]);
  // Ramazan 2027 (8 Feb - 9 Mar) starts its window a week early.
  assert.deepEqual(on(2027, 2, 14), ["Ramazan'a özel", "Sevgililer Günü"]);
  assert.deepEqual(on(2027, 2, 15), ["Ramazan'a özel"]);
  assert.deepEqual(on(2027, 3, 10), []);
  // Mother's Day 2027 is 9 May, Father's Day 20 June.
  assert.deepEqual(on(2027, 5, 9), ["Anneler Günü"]);
  assert.deepEqual(on(2027, 5, 10), []);
  assert.deepEqual(on(2027, 6, 20), ["Babalar Günü"]);
  assert.deepEqual(on(2027, 6, 21), []);
  assert.deepEqual(on(2027, 4, 1), []);
  assert.deepEqual(on(2027, 4, 1, "en"), []);
});

test("the season's badges lead the bank", () => {
  const bank = bankSuggestions("fashion", "tr", new Date(2026, 10, 16));
  assert.deepEqual(bank.badges.slice(0, 3), [
    "Kasım fırsatı",
    "Öğretmenler Günü",
    "Yeni sezon",
  ]);
  assert.equal(
    bankSuggestions("fashion", "tr", new Date(2027, 3, 1)).badges[0],
    "Yeni sezon",
  );
});

test("seasonal sets follow their date windows, Turkish only", () => {
  const ids = (y, m, d, lang = "tr") =>
    seasonalSets(new Date(y, m - 1, d), lang).map((s) => s.id);
  // Black Friday 2026 is 27 November: window 18 - 30 November.
  assert.deepEqual(ids(2026, 11, 17), []);
  assert.deepEqual(ids(2026, 11, 18), ["blackFriday"]);
  assert.deepEqual(ids(2026, 11, 30), ["blackFriday"]);
  assert.deepEqual(ids(2026, 12, 1), []);
  assert.deepEqual(ids(2026, 11, 4), ["singles"]);
  assert.deepEqual(ids(2026, 11, 11), ["singles"]);
  assert.deepEqual(ids(2027, 5, 9), ["mothers"]);
  assert.deepEqual(ids(2027, 5, 10), []);
  assert.deepEqual(ids(2027, 2, 1), ["ramadan"]);
  assert.deepEqual(ids(2027, 3, 9), ["ramadan"]);
  assert.deepEqual(ids(2030, 2, 10), []);
  for (const day of [[2026, 11, 20], [2026, 11, 8], [2027, 5, 1], [2027, 2, 20]])
    assert.deepEqual(ids(...day, "en"), []);
});

test("season copy fits the fields and claims nothing official", () => {
  const all = [
    new Date(2026, 10, 20),
    new Date(2026, 10, 8),
    new Date(2027, 4, 1),
    new Date(2027, 1, 20),
  ].flatMap((d) => seasonalSets(d, "tr"));
  assert.equal(all.length, 4);
  for (const set of all) {
    assert.equal(set.testID, "season-" + set.id);
    assert.ok(set.badge.length >= 2 && set.badge.length <= 18, set.id);
    assert.ok(set.headline.length <= 40 && set.cta.length <= 28, set.id);
    assert.ok(!/resmi|official|tüm mağaza|garanti/i.test(JSON.stringify(set)));
  }
  assert.ok(all.some((s) => s.badge === "Efsane Cuma"));
});
