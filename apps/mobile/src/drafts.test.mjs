// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAFT_VERSION,
  draftTitle,
  isDraftId,
  MAX_EXTRA_PHOTOS,
  parseDraft,
  parseEditState,
  restoreExtraPhotos,
  sameEditState,
  serializeDraft,
  sortDrafts,
} from "./drafts.ts";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CLIP = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const state = {
  template: "campaign",
  palette: "ocean",
  category: "fashion",
  styleChosen: true,
  headline: "Keten gömlek",
  price: "499 TL",
  badge: "%20 indirim",
  cta: "Hemen sipariş ver",
  store: "Moda Dükkanı",
  music: { file: CLIP + ".m4a", name: "Yaz.m4a" },
  preset: "reels",
  quality: "1080p",
  scene: {
    uri: "file:///cache/scene.jpg",
    crop: { x: 0.1, width: 0.8 },
    productRect: { x: 0.2, y: 0.3, width: 0.5, height: 0.4 },
  },
  backdrop: null,
  ownBackdrop: null,
  ownActive: false,
  ratio: "4:5",
  fontStyle: "elegant",
  oldPrice: "699 TL",
  priceTag: "pill",
  brandAccent: { accent: "#D7263D", onAccent: "#FFFFFF" },
  cutout: { width: 800, height: 1000 },
};
const draft = {
  ...state,
  version: DRAFT_VERSION,
  id: ID,
  created: 1000,
  updated: 2000,
  sourceClip: CLIP,
};

test("serializeDraft and parseDraft round-trip", () => {
  assert.deepEqual(parseDraft(serializeDraft(draft), ID), draft);
});

test("parseDraft rejects damaged or foreign data", () => {
  assert.equal(parseDraft("not json"), null);
  assert.equal(parseDraft("[]"), null);
  assert.equal(parseDraft(JSON.stringify({ ...draft, version: 2 })), null);
  assert.equal(parseDraft(JSON.stringify({ ...draft, id: "../x" })), null);
  assert.equal(parseDraft(serializeDraft(draft), CLIP), null, "wrong file");
  // No template at all: not a draft of ours.
  const noTemplate = { ...draft };
  delete noTemplate.template;
  assert.equal(parseDraft(JSON.stringify(noTemplate)), null);
  assert.equal(
    parseDraft(JSON.stringify({ ...draft, cutout: { width: 0, height: 1 } })),
    null,
  );
  assert.equal(parseDraft(JSON.stringify({ ...draft, updated: "x" })), null);
});

test("parseEditState fills safe defaults for optional fields", () => {
  const parsed = parseEditState({
    template: "store",
    palette: "noir",
    category: "home",
    cutout: { width: 10, height: 10 },
    preset: "tiktok",
    quality: "4k",
    music: { file: "../../etc/passwd", name: "x" },
    scene: { uri: "file:///a.jpg", crop: { x: 0 } },
    headline: 42,
    styleChosen: "yes",
  });
  assert.equal(parsed.preset, "trendyol");
  assert.equal(parsed.quality, "720p");
  assert.equal(parsed.music, null);
  assert.equal(parsed.scene, null);
  assert.equal(parsed.headline, "");
  assert.equal(parsed.styleChosen, false);
});

test("text fields are capped and extra fields dropped", () => {
  const parsed = parseDraft(
    JSON.stringify({ ...draft, headline: "x".repeat(500), evil: true }),
  );
  assert.equal(parsed.headline.length, 120);
  assert.equal("evil" in parsed, false);
  assert.equal(
    JSON.parse(serializeDraft({ ...draft, evil: 1 })).evil,
    undefined,
  );
});

test("sourceClip must be a uuid", () => {
  const parsed = parseDraft(JSON.stringify({ ...draft, sourceClip: "x" }));
  assert.equal(parsed.sourceClip, null);
});

test("sameEditState ignores draft metadata and compares content", () => {
  assert.equal(sameEditState(state, { ...draft, updated: 9 }), true);
  assert.equal(sameEditState(state, { ...state, price: "599 TL" }), false);
  assert.equal(sameEditState(state, { ...state, styleChosen: false }), false);
});

test("draftTitle prefers the headline", () => {
  assert.equal(
    draftTitle({ headline: "  Gül parfüm " }, "Vitrin"),
    "Gül parfüm",
  );
  assert.equal(draftTitle({ headline: "  " }, "Vitrin"), "Vitrin");
});

test("sortDrafts puts the newest first without mutating", () => {
  const list = [{ updated: 1 }, { updated: 3 }, { updated: 2 }];
  assert.deepEqual(
    sortDrafts(list).map((d) => d.updated),
    [3, 2, 1],
  );
  assert.equal(list[0].updated, 1);
});

test("isDraftId", () => {
  assert.equal(isDraftId(ID), true);
  assert.equal(isDraftId("abc"), false);
  assert.equal(isDraftId(undefined), false);
});

test("drafts saved before backdrops, ratio, type and old price still open", () => {
  const old = { ...draft };
  delete old.backdrop;
  delete old.ratio;
  delete old.fontStyle;
  delete old.oldPrice;
  delete old.priceTag;
  delete old.brandAccent;
  const parsed = parseDraft(JSON.stringify(old), ID);
  assert.ok(parsed);
  assert.equal(parsed.backdrop, null);
  assert.equal(parsed.ratio, "9:16");
  assert.equal(parsed.fontStyle, null);
  assert.equal(parsed.oldPrice, "");
  assert.equal(parsed.priceTag, null);
  assert.equal(parsed.brandAccent, null);
});

test("backdrop, ratio and type family are validated", () => {
  const parsed = parseDraft(
    JSON.stringify({
      ...draft,
      backdrop: "oak",
      ratio: "1:1",
      fontStyle: "poster",
    }),
  );
  assert.equal(parsed.backdrop, "oak");
  assert.equal(parsed.ratio, "1:1");
  assert.equal(parsed.fontStyle, "poster");
  const bad = parseDraft(
    JSON.stringify({
      ...draft,
      backdrop: "file:///x.jpg",
      ratio: "16:9",
      fontStyle: "comic",
    }),
  );
  assert.equal(bad.backdrop, null);
  assert.equal(bad.ratio, "9:16");
  assert.equal(bad.fontStyle, null);
});

test("the new templates are accepted", () => {
  for (const template of ["editorial", "detail", "discount", "minimal"])
    assert.equal(
      parseDraft(JSON.stringify({ ...draft, template }))?.template,
      template,
    );
});

test("an own photo backdrop is stored by file name and read tolerantly", () => {
  const own = {
    file: CLIP + ".jpg",
    width: 3024,
    height: 4032,
    scale: 1.2,
    offset: -0.08,
    text: "dark",
  };
  const withOwn = { ...draft, scene: null, ownBackdrop: own, ownActive: true };
  assert.deepEqual(parseDraft(serializeDraft(withOwn), ID), withOwn);
  // Older drafts have none; a URI or a path is refused.
  const old = { ...draft };
  delete old.ownBackdrop;
  assert.equal(parseDraft(JSON.stringify(old), ID).ownBackdrop, null);
  for (const file of ["file:///x.jpg", "../" + CLIP + ".jpg", CLIP + ".mp4"])
    assert.equal(
      parseDraft(
        JSON.stringify({ ...draft, ownBackdrop: { ...own, file } }),
        ID,
      ).ownBackdrop,
      null,
      file,
    );
  // Out-of-range controls are clamped, unknown text colour is light.
  const odd = parseDraft(
    JSON.stringify({
      ...draft,
      ownBackdrop: { ...own, scale: 5, offset: 1, text: "red" },
    }),
    ID,
  ).ownBackdrop;
  assert.equal(odd.scale, 1.4);
  assert.equal(odd.offset, 0.12);
  assert.equal(odd.text, "light");
});

test("a draft naming an id this build does not know still opens (finding 10)", () => {
  const parsed = parseDraft(
    JSON.stringify({
      ...draft,
      template: "removed-template",
      palette: "removed-palette",
      category: "removed-category",
    }),
    ID,
  );
  assert.ok(parsed, "the draft is kept");
  assert.equal(parsed.template, "showcase");
  assert.equal(parsed.palette, "ivory");
  assert.equal(parsed.category, "cosmetics");
  assert.equal(parsed.headline, draft.headline, "the user's texts survive");
});

test("an inactive own photo is kept with its settings (coordinator item 1)", () => {
  const own = {
    file: CLIP + ".jpg",
    width: 3024,
    height: 4032,
    scale: 1.2,
    offset: -0.08,
    text: "dark",
  };
  // Switched to a bundled backdrop: the photo and its settings stay.
  const away = {
    ...draft,
    backdrop: "oak",
    ownBackdrop: own,
    ownActive: false,
  };
  const parsed = parseDraft(serializeDraft(away), ID);
  assert.deepEqual(parsed.ownBackdrop, own);
  assert.equal(parsed.ownActive, false);
  assert.equal(parsed.backdrop, "oak");
  // Back to the photo: exactly as left.
  const back = parseDraft(serializeDraft({ ...parsed, ownActive: true }), ID);
  assert.deepEqual(back.ownBackdrop, own);
  assert.equal(back.ownActive, true);
  // A draft written before ownActive existed opens with its photo active.
  const old = JSON.parse(
    serializeDraft({ ...draft, ownBackdrop: own, ownActive: true }),
  );
  delete old.ownActive;
  assert.equal(parseDraft(JSON.stringify(old), ID).ownActive, true);
  // No photo: never active.
  assert.equal(
    parseDraft(
      serializeDraft({ ...draft, ownBackdrop: null, ownActive: true }),
      ID,
    ).ownActive,
    false,
  );
});

// ---- Several photos (rakipleri-gecme task 3) --------------------------------

const extra = (i, withCutout = true) => ({
  source: `${ID}.x${i}.jpg`,
  ...(withCutout ? { cutout: `${ID}.x${i}c.png`, width: 600, height: 900 } : {}),
});

test("draft without extraPhotos parses as before", () => {
  const raw = serializeDraft(draft);
  assert.equal("extraPhotos" in JSON.parse(raw), false, "nothing new written");
  const parsed = parseDraft(raw, ID);
  assert.deepEqual(parsed, draft);
  assert.equal("extraPhotos" in parsed, false);
  assert.equal("musicPattern" in parsed, false);
  // An empty or broken list is the same as none.
  for (const extraPhotos of [[], "x", [{ source: 4 }], null])
    assert.equal(
      "extraPhotos" in parseDraft(JSON.stringify({ ...draft, extraPhotos }), ID),
      false,
    );
});

test("missing extra photo is dropped", () => {
  const list = [extra(1), extra(2, false), extra(3)];
  const stored = { ...draft, extraPhotos: list };
  const parsed = parseDraft(serializeDraft(stored), ID);
  assert.deepEqual(parsed.extraPhotos, list, "file names round-trip");
  // Photo 2 was deleted; photo 3 lost only its cut-out.
  const onDisk = new Set([list[0].source, list[0].cutout, list[2].source]);
  const restored = restoreExtraPhotos(parsed.extraPhotos, (name) =>
    onDisk.has(name),
  );
  assert.equal(restored.missing, true, "the editor says so once");
  assert.deepEqual(restored.photos, [list[0], { source: list[2].source }]);
  assert.equal(
    restoreExtraPhotos(parsed.extraPhotos, () => true).missing,
    false,
  );
  // Paths, URIs and other files are refused when read.
  const bad = parseDraft(
    JSON.stringify({
      ...draft,
      extraPhotos: [
        { source: "../" + ID + ".x1.jpg" },
        { source: "file:///x.jpg" },
        { source: ID + ".x1.jpg", cutout: "/etc/passwd" },
      ],
    }),
    ID,
  );
  assert.deepEqual(bad.extraPhotos, [{ source: ID + ".x1.jpg" }]);
});

test("more than 8 photos is capped", () => {
  assert.equal(MAX_EXTRA_PHOTOS, 7, "the main photo plus 7");
  const many = Array.from({ length: 10 }, (_, i) => extra((i % 7) + 1));
  const parsed = parseDraft(JSON.stringify({ ...draft, extraPhotos: many }), ID);
  assert.equal(parsed.extraPhotos.length, 7);
  assert.equal(
    JSON.parse(serializeDraft({ ...draft, extraPhotos: many })).extraPhotos
      .length,
    7,
  );
});

test("music pattern stored, not uri", () => {
  const withBeat = { ...draft, music: null, musicPattern: "house" };
  const raw = serializeDraft(withBeat);
  assert.equal(JSON.parse(raw).musicPattern, "house");
  assert.doesNotMatch(raw, /\.wav|vidora-music|file:\/\/\/cache\/vidora-music/);
  assert.deepEqual(parseDraft(raw, ID), withBeat);
  assert.equal(
    parseDraft(serializeDraft({ ...draft, musicPattern: "off" }), ID)
      .musicPattern,
    "off",
  );
  const uri = parseDraft(
    JSON.stringify({
      ...draft,
      musicPattern: "file:///cache/vidora-music-v1-house-12000-9000.wav",
    }),
    ID,
  );
  assert.equal("musicPattern" in uri, false);
});

test("an AI scene that shows the product keeps its flag in drafts", () => {
  const ai = { ...draft, scene: { ...draft.scene, containsProduct: true } };
  assert.deepEqual(parseDraft(serializeDraft(ai), ID), ai);
  const odd = parseDraft(
    JSON.stringify({ ...draft, scene: { ...draft.scene, containsProduct: "y" } }),
    ID,
  );
  assert.equal("containsProduct" in odd.scene, false);
});

test("draft with a variant and photo 1's original round-trips", () => {
  const withVariant = {
    ...draft,
    variant: "kutu-acilisi-3",
    photo: ID + ".p.heic",
  };
  const raw = serializeDraft(withVariant);
  assert.equal(JSON.parse(raw).variant, "kutu-acilisi-3");
  assert.equal(JSON.parse(raw).photo, ID + ".p.heic");
  assert.deepEqual(parseDraft(raw, ID), withVariant);
  // Odd values are dropped, the draft still opens.
  for (const bad of [
    { variant: 4 },
    { variant: "../x" },
    { variant: "Kombin 1" },
    { photo: "file:///cache/p.jpg" },
    { photo: "../" + ID + ".p.jpg" },
    { photo: ID + ".x1.jpg" },
  ]) {
    const parsed = parseDraft(JSON.stringify({ ...draft, ...bad }), ID);
    assert.ok(parsed, JSON.stringify(bad));
    assert.equal("variant" in parsed, false);
    assert.equal("photo" in parsed, false);
  }
});

test("an old draft (no variant, no photo) is unchanged", () => {
  const raw = serializeDraft(draft);
  const json = JSON.parse(raw);
  assert.equal("variant" in json, false, "nothing new written");
  assert.equal("photo" in json, false, "nothing new written");
  const parsed = parseDraft(raw, ID);
  assert.deepEqual(parsed, draft);
  assert.equal("variant" in parsed, false);
  assert.equal("photo" in parsed, false);
  assert.equal(serializeDraft(parsed), raw, "byte-identical");
});

test("an editorial draft keeps its mode and AI shots (missing ones stay null)", () => {
  const a1 = ID + ".a1.jpg",
    a3 = ID + ".a3.jpg";
  const editorial = { ...draft, editorial: true, aiShots: [a1, null, a3] };
  const raw = serializeDraft(editorial);
  const parsed = parseDraft(raw, ID);
  assert.equal(parsed.editorial, true);
  assert.deepEqual(parsed.aiShots, [a1, null, a3]);
  assert.equal(serializeDraft(parsed), raw, "byte-identical");
  // Paths, URIs, wrong slots and odd modes are dropped; no shot at all: no field.
  const odd = parseDraft(
    JSON.stringify({
      ...JSON.parse(raw),
      editorial: "yes",
      aiShots: ["../x.jpg", "file:///cache/a.jpg", ID + ".a9.jpg", a1],
    }),
    ID,
  );
  assert.equal("editorial" in odd, false);
  assert.equal("aiShots" in odd, false);
  const none = parseDraft(serializeDraft({ ...draft, editorial: true, aiShots: [null, null, null] }), ID);
  assert.equal(none.editorial, true);
  assert.equal("aiShots" in none, false);
});

test("an editorial draft keeps its cut id; older ones and odd ids have none", () => {
  const raw = serializeDraft({ ...draft, editorial: true, editorialCut: "sakin-luks" });
  const parsed = parseDraft(raw, ID);
  assert.equal(parsed.editorialCut, "sakin-luks");
  assert.equal(serializeDraft(parsed), raw, "byte-identical");
  // Before the cuts: no field (the editor opens the signature cut).
  const old = parseDraft(serializeDraft({ ...draft, editorial: true }), ID);
  assert.equal("editorialCut" in old, false);
  for (const cut of ["../x", "Ritim", 7, ""]) {
    const odd = parseDraft(
      JSON.stringify({ ...JSON.parse(raw), editorialCut: cut }),
      ID,
    );
    assert.equal("editorialCut" in odd, false, String(cut));
  }
  // Only editorial drafts carry it.
  const classic = serializeDraft({ ...draft, editorialCut: "ritim" });
  assert.equal("editorialCut" in JSON.parse(classic), false);
});

test("an old draft has no editorial fields and stays byte-identical", () => {
  const raw = serializeDraft(draft);
  const json = JSON.parse(raw);
  assert.equal("editorial" in json, false);
  assert.equal("aiShots" in json, false);
  assert.equal(serializeDraft(parseDraft(raw, ID)), raw);
});
