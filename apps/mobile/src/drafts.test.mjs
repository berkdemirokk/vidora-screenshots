// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAFT_VERSION,
  draftTitle,
  isDraftId,
  parseDraft,
  parseEditState,
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
