import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  FEED_BAND,
  PRODUCT_CLEARANCE,
  SPLIT_EDGE,
  beatTimes,
  ratioLayout,
  buildRecipeSpec,
  estimateLines,
  luminance,
  mixHex,
  textHalfHeight,
  textMaxWidth,
  textWidth,
  toneBackground,
} from "./recipes/build.ts";
import { LIMITS, paletteById, specProblems } from "./product-templates.ts";
import { INDIRIM } from "./recipes/indirim.ts";
import { YENI_KOLEKSIYON } from "./recipes/yeni-koleksiyon.ts";
import { RECIPES, VARIANTS, variantById } from "./recipes/index.ts";

const key = (t, scale = 1) => ({
  t,
  x: 0.5,
  y: 0.5,
  scale,
  rotation: 0,
  opacity: 1,
  yaw: 0,
  ease: "inOut",
});

const mkScene = (slot, over = {}) => ({
  slot,
  mode: "photo",
  length: 4,
  keys: [key(0, 1), key(2, 1.2)],
  transition: { kind: "push", duration: 0.4 },
  ...over,
});

const style = { weight: "heavy", animation: "rise" };

const mkRecipe = (over = {}) => ({
  id: "t",
  tr: "T",
  en: "T",
  minPhotos: 1,
  maxPhotos: 5,
  bpm: 120,
  scenes: [0, 1, 2].map((i) => mkScene(i)),
  texts: [
    { field: "name", start: 0.2, end: 3, y: 0.2, size: 0.07, style },
    { field: "price", start: 0.5, end: 5, y: 0.8, size: 0.08, style, onAccent: true },
    { field: "oldPrice", start: 0.5, end: 5, y: 0.7, size: 0.05, style: { ...style, strike: true } },
  ],
  endHold: 1,
  ...over,
});

const mkInput = (over = {}) => ({
  photos: ["file:///p0.jpg", "file:///p1.jpg", "file:///p2.jpg"],
  cutouts: ["file:///c0.png", "file:///c1.png", "file:///c2.png"],
  name: "Amber",
  price: "1.249 TL",
  oldPrice: "1.499 TL",
  badge: "",
  cta: "",
  palette: "ivory",
  ratio: "9:16",
  quality: "1080p",
  ...over,
});

test("beatTimes at 120 bpm", () => {
  assert.deepEqual(beatTimes(120, [2, 4, 3]), [0, 1, 3]);
});

test("fewer photos than slots repeat in order", () => {
  const recipe = mkRecipe({ scenes: [0, 1, 2, 3, 4].map((i) => mkScene(i, { length: 2 })) });
  const spec = buildRecipeSpec(
    recipe,
    mkInput({ photos: ["p0", "p1"], cutouts: [null, null] }),
  );
  assert.deepEqual(
    spec.scenes.map((s) => s.image),
    ["p0", "p1", "p0", "p1", "p0"],
  );
});

test("missing cutout falls back to photo", () => {
  const recipe = mkRecipe({
    scenes: [0, 1, 2].map((i) => mkScene(i, { mode: "cutout" })),
  });
  const spec = buildRecipeSpec(
    recipe,
    mkInput({ cutouts: ["file:///c0.png", null, "file:///c2.png"] }),
  );
  assert.equal(spec.scenes[0].mode, "cutout");
  assert.equal(spec.scenes[0].image, "file:///c0.png");
  assert.equal(spec.scenes[1].mode, "photo");
  assert.equal(spec.scenes[1].image, "file:///p1.jpg");
});

test("depth recipe scene stays depth in the built spec", () => {
  const recipe = mkRecipe({
    scenes: [
      mkScene(0, { mode: "depth" }),
      mkScene(1, { mode: "cutout" }),
      mkScene(2, { mode: "depth" }),
    ],
  });
  const spec = buildRecipeSpec(recipe, mkInput({ cutouts: [null, null, null] }));
  assert.equal(spec.scenes[0].mode, "depth");
  assert.equal(spec.scenes[0].image, "file:///p0.jpg");
  assert.equal(spec.scenes[1].mode, "photo");
  assert.equal(spec.scenes[2].mode, "depth");
  assert.equal(spec.scenes[2].image, "file:///p2.jpg");
  assert.deepEqual(specProblems(spec), []);
});

test("empty old price leaves no text", () => {
  const spec = buildRecipeSpec(mkRecipe(), mkInput({ oldPrice: "" }));
  assert.ok(!spec.texts.some((t) => t.text === "1.499 TL"));
  assert.equal(spec.texts.length, 2);
});

test("transition clamps to scene length", () => {
  const recipe = mkRecipe({
    bpm: 120,
    scenes: [
      mkScene(0, { length: 4 }),
      mkScene(1, { length: 1, transition: { kind: "wipe", duration: 1.2 } }),
      mkScene(2, { length: 4 }),
    ],
  });
  const spec = buildRecipeSpec(recipe, mkInput());
  assert.ok(spec.scenes[1].transition.duration <= 0.5);
});

test("built spec has no spec problems", () => {
  const spec = buildRecipeSpec(mkRecipe(), mkInput());
  assert.deepEqual(specProblems(spec), []);
  assert.equal(spec.relief, 0);
  assert.equal(spec.product, spec.scenes[0].image);
  assert.ok(spec.keys.length >= 2);
  const price = spec.texts.find((t) => t.text === "1.249 TL");
  assert.notEqual(price.fill, "");
  assert.deepEqual(specProblems(buildRecipeSpec(mkRecipe(), mkInput({ oldPrice: "" }))), []);
});

test("duration capped at 15 s", () => {
  const recipe = mkRecipe({
    bpm: 60,
    scenes: [0, 1, 2, 3, 4, 5].map((i) => mkScene(i, { length: 5 })),
    endHold: 2,
  });
  const spec = buildRecipeSpec(recipe, mkInput());
  assert.equal(spec.duration, 15);
  assert.ok(spec.scenes.every((s) => s.start < 15));
  assert.deepEqual(specProblems(spec), []);
});

test("yeni koleksiyon builds with one photo", () => {
  const spec = buildRecipeSpec(
    YENI_KOLEKSIYON,
    mkInput({
      photos: ["file:///p0.jpg"],
      cutouts: ["file:///c0.png"],
      badge: "Yeni",
      cta: "Hemen al",
    }),
  );
  assert.equal(spec.scenes.length, 5);
  assert.deepEqual(
    spec.scenes.map((s) => s.start),
    [0, 1, 3, 4.5, 6.5],
  );
  assert.ok(spec.scenes.every((s) => Math.abs(s.start * 2 - Math.round(s.start * 2)) < 1e-9));
  assert.deepEqual(specProblems(spec), []);
  // End card is still from 7.4 s: no key changes in the last 1.6 s.
  const last = spec.scenes[4];
  const stillFrom = 7.4 - last.start;
  assert.ok(last.keys.every((k) => k.t <= stillFrom + 1e-9));
  assert.equal(spec.duration, 9);
  assert.ok(spec.texts.every((t) => t.start <= 7.4));
  assert.ok(spec.texts.every((t) => t.y >= 0.14 && t.y <= 0.8));
});

// MARK: Recipe library and variants

const fullInput = (n, palette) =>
  mkInput({
    photos: Array.from({ length: n }, (_, i) => `file:///p${i}.jpg`),
    cutouts: Array.from({ length: n }, (_, i) => `file:///c${i}.png`),
    name: "Lavanta Yağı",
    price: "349 TL",
    oldPrice: "449 TL",
    badge: "%30 İNDİRİM",
    cta: "Hemen al",
    palette,
  });

const onGrid = (s) => Math.abs(s * 2 - Math.round(s * 2)) < 1e-9;

test("library: six recipes, thirty variants, unique ids", () => {
  assert.equal(RECIPES.length, 6);
  assert.ok(RECIPES.includes(YENI_KOLEKSIYON));
  assert.deepEqual(
    RECIPES.map((r) => r.id).sort(),
    ["indirim", "kombin", "kutu-acilisi", "once-sonra", "urun-detaylari", "yeni-koleksiyon"],
  );
  assert.equal(VARIANTS.length, 30);
  assert.equal(new Set(VARIANTS.map((v) => v.id)).size, 30);
  for (const r of RECIPES) {
    const mine = VARIANTS.filter((v) => v.recipe.id === r.id);
    assert.deepEqual(
      mine.map((v) => v.id),
      [1, 2, 3, 4, 5].map((n) => `${r.id}-${n}`),
    );
    assert.equal(new Set(mine.map((v) => v.palette)).size, 5, r.id + " palettes");
  }
  for (const v of VARIANTS) {
    assert.ok(v.tr && v.en, v.id);
    assert.equal(variantById(v.id), v);
  }
  assert.equal(variantById("yok-1"), undefined);
});

test("library: every variant builds with 1 and 8 photos with no spec problems", () => {
  for (const v of VARIANTS)
    for (const n of [1, 8]) {
      const spec = buildRecipeSpec(v.recipe, fullInput(n, v.palette));
      const tag = `${v.id} (${n} photos)`;
      assert.deepEqual(specProblems(spec), [], tag);
      assert.ok(spec.duration >= 8 && spec.duration <= 15, tag + " duration");
      assert.ok(spec.scenes.length <= 8, tag + " scenes");
      assert.ok(spec.scenes.every((s) => onGrid(s.start)), tag + " grid");
      assert.ok(spec.scenes.every((s) => s.image), tag + " images");
      assert.ok(spec.texts.every((t) => t.y >= 0.14 && t.y <= 0.8), tag + " text band");
      const moving = spec.scenes.slice(1).filter((s) => s.transition.kind !== "cut");
      assert.ok(moving.length <= 1, tag + " moving transitions");
    }
});

test("library: every recipe fits the text limit, so no text is dropped", () => {
  for (const r of RECIPES) {
    assert.ok(r.texts.length <= LIMITS.maxTexts, r.id);
    assert.equal(r.bpm, 120, r.id);
    assert.equal(
      r.scenes.slice(1).filter((s) => s.transition.kind !== "cut").length,
      1,
      r.id + " one moving transition",
    );
  }
});

test("library: depth scene in every recipe except Önce/Sonra", () => {
  for (const r of RECIPES) {
    if (r.id === "once-sonra" || r.id === "yeni-koleksiyon") continue;
    assert.ok(r.scenes.some((s) => s.mode === "depth"), r.id);
  }
});

test("library: Önce/Sonra needs two photos and wipes into the second", () => {
  const r = RECIPES.find((x) => x.id === "once-sonra");
  assert.equal(r.minPhotos, 2);
  assert.equal(r.scenes[0].slot, 0);
  assert.equal(r.scenes[1].slot, 1);
  assert.equal(r.scenes[1].transition.kind, "wipe");
  // Only the seller's badge labels the photos; no badge, no label.
  const plain = buildRecipeSpec(r, { ...fullInput(2, "ivory"), badge: "" });
  assert.ok(!plain.texts.some((t) => t.text === "%30 İNDİRİM"));
  const labelled = buildRecipeSpec(r, fullInput(2, "ivory"));
  assert.ok(labelled.texts.some((t) => t.text === "%30 İNDİRİM"));
});

test("library: İndirim opens on the badge, strikes the old price, then slams the new one", () => {
  const r = RECIPES.find((x) => x.id === "indirim");
  const spec = buildRecipeSpec(r, fullInput(3, "ocean"));
  assert.equal(spec.texts[0].text, "%30 İNDİRİM");
  assert.equal(spec.texts[0].start, 0);
  const old = spec.texts.find((t) => t.text === "449 TL");
  const price = spec.texts.find((t) => t.text === "349 TL");
  assert.equal(old.strike, true);
  assert.ok(price.start > old.start);
  assert.ok(price.size >= 0.15);
});

test("library: end card is still for its last 1.5 s", () => {
  for (const v of VARIANTS) {
    const spec = buildRecipeSpec(v.recipe, fullInput(8, v.palette));
    const last = spec.scenes[spec.scenes.length - 1];
    const stillFrom = spec.duration - 1.5;
    assert.ok(last.start <= stillFrom, v.id);
    assert.ok(last.keys.every((k) => last.start + k.t <= stillFrom + 1e-9), v.id + " keys");
    assert.ok(spec.texts.every((t) => t.start <= stillFrom + 1e-9), v.id + " text starts");
    assert.ok(
      spec.texts.every((t) => t.end <= stillFrom + 1e-9 || t.end === spec.duration),
      v.id + " text exits",
    );
  }
});

test("library: with every field filled, each end card shows name, price and action", () => {
  for (const r of RECIPES) {
    const spec = buildRecipeSpec(r, fullInput(8, "ivory"));
    const card = spec.scenes[spec.scenes.length - 1].start;
    const onCard = spec.texts.filter((t) => t.end > card && t.start >= card - 1e-9);
    for (const text of ["Lavanta Yağı", "349 TL", "Hemen al"]) {
      if (r.id === "indirim" && text === "Lavanta Yağı") continue; // urgency card: price + action
      assert.ok(onCard.some((t) => t.text === text), `${r.id} end card lacks ${text}`);
    }
  }
});

test("library: texts keep 0.025 clear of the product in cut-out scenes", () => {
  const CLEAR = 0.025;
  for (const r of RECIPES) {
    const starts = beatTimes(r.bpm, r.scenes.map((s) => s.length));
    r.scenes.forEach((sc, i) => {
      if (sc.mode !== "cutout") return;
      const from = starts[i];
      const to = from + sc.length * (60 / r.bpm);
      for (const t of r.texts) {
        if (t.end <= from || t.start >= to) continue;
        // Text height as a fraction of a 9:16 frame: a line is about
        // size * 0.6 (Anton, line height ~1.05); big names and badges may
        // wrap to two lines; pills add 0.35 em above and below.
        const lines = (t.field === "name" || t.field === "badge") && t.size >= 0.12 ? 2 : 1;
        const half = (t.size * 0.6 * (lines + (t.onAccent ? 0.7 : 0.3))) / 2;
        for (const k of sc.keys) {
          const top = k.y - k.scale / 2,
            bottom = k.y + k.scale / 2;
          assert.ok(
            t.y + half <= top - CLEAR + 1e-9 || t.y - half >= bottom + CLEAR - 1e-9,
            `${r.id} scene ${i} ${t.field} within ${CLEAR} of the product`,
          );
        }
      }
    });
  }
});

test("library: hero cut-outs fill at least half the frame, end cards about 45 %", () => {
  for (const r of RECIPES) {
    const last = r.scenes[r.scenes.length - 1];
    const heroes = r.scenes.filter((s) => s.mode === "cutout" && s !== last);
    if (r.id === "once-sonra") assert.equal(heroes.length, 0);
    else {
      const biggest = Math.max(...heroes.flatMap((s) => s.keys.map((k) => k.scale)));
      assert.ok(biggest >= 0.5, `${r.id} hero ${biggest}`);
    }
    assert.equal(last.mode, "cutout", r.id);
    assert.ok(last.keys[last.keys.length - 1].scale >= 0.44, r.id + " end card product");
  }
});

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Background colour at height `y` (frame fractions) on the centre line, where
 * texts are centred: a split background gives the colour of the side the
 * centre (x 0.5) falls on, otherwise the top-to-bottom gradient.
 */
const toneAt = (bg, y) => {
  const radius = 0.75 * (9 / 16);
  const glow = 0.85 * Math.max(0, 1 - Math.abs(y - 0.55) / radius);
  const base = bg.split > 0 ? (0.5 >= bg.split ? bg.bottom : bg.top) : mixHex(bg.top, bg.bottom, y);
  return mixHex(base, bg.glow, glow);
};

test("split tone: hard edge at 0.22, paper left, accent right; price checked on the accent side", () => {
  for (const id of ["ivory", "noir"]) {
    const p = paletteById(id);
    const bg = toneBackground(p, "split");
    assert.equal(bg.split, 0.22, id);
    assert.equal(bg.bottom, p.accent, id);
    assert.notEqual(bg.top, p.accent, id);
    assert.equal(toneAt(bg, 0.05), bg.bottom, id);
    const spec = buildRecipeSpec(INDIRIM, fullInput(3, id));
    assert.deepEqual(specProblems(spec), [], id);
    assert.ok(spec.scenes.some((s) => s.background?.split === 0.22), id);
  }
});

test("contrast check samples the split scene's mid-tone, not its top", () => {
  const p = paletteById("ivory");
  const bg = { top: "#F4EFE6", bottom: p.accent, glow: mixHex("#F4EFE6", p.accent, 0.5) };
  const mid = toneAt(bg, 0.32);
  assert.notEqual(mid, bg.top);
  assert.ok(luminance(mid) < luminance(bg.top));
});

test("library: toned cut-out scenes get a palette background and readable type", () => {
  const tones = new Set();
  for (const v of VARIANTS) {
    const spec = buildRecipeSpec(v.recipe, fullInput(8, v.palette));
    const palette = paletteById(v.palette);
    v.recipe.scenes.forEach((rs, i) => {
      const sc = spec.scenes[i];
      if (!rs.tone) return assert.equal(sc.background, undefined, v.id);
      tones.add(rs.tone);
      const bg = sc.background;
      for (const c of [bg.top, bg.bottom, bg.glow]) assert.match(c, /^#[0-9A-F]{6}$/i, v.id);
      if (rs.tone === "accent") assert.equal(bg.top, palette.accent, v.id);
      const end = i + 1 < spec.scenes.length ? spec.scenes[i + 1].start : spec.duration;
      for (const t of spec.texts.filter((t) => t.start >= sc.start && t.start < end)) {
        // Pills against their fill; plain type against the tone where it
        // sits: the top-to-bottom gradient at the text's y (a split tone:
        // the side its centre falls on), under the glow
        // (0.85 alpha at y 0.55, fading out over 0.75 frame widths).
        const ratio = t.fill ? contrast(t.color, t.fill) : contrast(t.color, toneAt(bg, t.y));
        assert.ok(ratio >= 3, `${v.id} scene ${i} "${t.text}" contrast ${ratio.toFixed(2)}`);
      }
    });
  }
  assert.deepEqual([...tones].sort(), ["accent", "dark", "light", "split"]);
});

test("library: a cut-out scene that falls back to a photo keeps no tone", () => {
  const spec = buildRecipeSpec(YENI_KOLEKSIYON, {
    ...fullInput(1, "noir"),
    cutouts: [null],
  });
  assert.ok(spec.scenes.every((s) => s.mode === "photo" && s.background === undefined));
  assert.deepEqual(specProblems(spec), []);
});

// MARK: Long names

const NAMES = [
  "Gömlek",
  "Keten Gömlek M",
  "Organik Lavanta Yağı 50 ml",
  "El Yapımı Seramik Kahve Fincanı Seti 2li",
];

const linesOf = (t) => estimateLines(t.text, t.size, t.font ?? "system", t.tracking ?? 0, t.fill !== "");
const halfOf = (t) => textHalfHeight(linesOf(t), t.size, t.fill !== "");

/** Problems of a built spec: product clearance and text overlaps. */
function layoutProblems(spec) {
  const out = [];
  spec.scenes.forEach((s, i) => {
    const end = i + 1 < spec.scenes.length ? spec.scenes[i + 1].start : spec.duration;
    if (s.mode !== "cutout") return;
    for (const t of spec.texts) {
      if (t.end <= s.start || t.start >= end) continue;
      const half = halfOf(t);
      for (const k of s.keys) {
        const top = k.y - k.scale / 2,
          bottom = k.y + k.scale / 2;
        if (!(t.y + half <= top - PRODUCT_CLEARANCE + 1e-6 || t.y - half >= bottom + PRODUCT_CLEARANCE - 1e-6))
          out.push(`"${t.text}" within ${PRODUCT_CLEARANCE} of the product in scene ${i}`);
      }
    }
  });
  spec.texts.forEach((a, i) =>
    spec.texts.slice(i + 1).forEach((b) => {
      if (a.end <= b.start || b.end <= a.start) return;
      if (Math.abs(a.y - b.y) < halfOf(a) + halfOf(b) - 1e-6) out.push(`"${a.text}" overlaps "${b.text}"`);
    }),
  );
  return out;
}

test("long names: the test names are 6, 14, 26 and 40 characters", () => {
  assert.deepEqual(NAMES.map((n) => [...n].length), [6, 14, 26, 40]);
});

test("long names: every recipe fits them in two lines, inside the margins, clear of the product", () => {
  for (const r of RECIPES)
    for (const name of NAMES) {
      const spec = buildRecipeSpec(r, { ...fullInput(8, "ivory"), name });
      const tag = `${r.id} "${name}"`;
      assert.deepEqual(specProblems(spec), [], tag);
      const names = spec.texts.filter((t) => t.text === name);
      assert.ok(names.length >= 1, tag);
      for (const t of names) {
        assert.ok(linesOf(t) <= 2, `${tag} ${linesOf(t)} lines at ${t.size}`);
        const max = textMaxWidth(t.size, t.fill !== "");
        for (const word of name.split(" "))
          assert.ok(textWidth(word, t.size, t.font, t.tracking ?? 0) <= max, `${tag} word ${word}`);
        assert.ok(t.y >= 0.14 && t.y <= 0.8, `${tag} y ${t.y}`);
        assert.ok(t.size >= 0.04, `${tag} size ${t.size}`);
      }
      assert.deepEqual(layoutProblems(spec), [], tag);
    }
});

test("long names: short names keep the designed size and place", () => {
  for (const r of RECIPES) {
    const spec = buildRecipeSpec(r, { ...fullInput(8, "ivory"), name: "Gömlek" });
    const designed = r.texts.filter((t) => t.field === "name");
    const built = spec.texts.filter((t) => t.text === "Gömlek");
    assert.equal(built.length, designed.length, r.id);
    built.forEach((t, i) => {
      assert.equal(t.size, designed[i].size, r.id);
      assert.equal(t.y, designed[i].y, r.id);
    });
  }
});

test("long names: every variant stays clear of the product with any font", () => {
  for (const v of VARIANTS)
    for (const name of NAMES) {
      const spec = buildRecipeSpec(v.recipe, { ...fullInput(8, v.palette), name });
      assert.deepEqual(specProblems(spec), [], `${v.id} "${name}"`);
      assert.deepEqual(layoutProblems(spec), [], `${v.id} "${name}"`);
    }
});

test("library: a variant applies its font and transition to the recipe", () => {
  for (const v of VARIANTS) {
    const base = RECIPES.find((r) => r.id === v.recipe.id);
    v.recipe.texts.forEach((t, i) => {
      const was = base.texts[i].style.font;
      assert.equal(t.style.font, was === "impact" ? v.font : was, v.id);
    });
    v.recipe.scenes.forEach((s, i) => {
      const was = base.scenes[i].transition.kind;
      const want = was !== "cut" && v.transition ? v.transition : was;
      assert.equal(s.transition.kind, want, v.id);
    });
  }
  // The base recipes are not changed by building variants.
  assert.equal(YENI_KOLEKSIYON.scenes[4].transition.kind, "wipe");
  assert.equal(YENI_KOLEKSIYON.texts[0].style.font, "impact");
});

test("create.tsx passes the source photo to the recipe", () => {
  const src = readFileSync(new URL("../app/create.tsx", import.meta.url), "utf8");
  // Photo 1 is the picked photo when known (else the cut-out), then the
  // added photos; the recipe gets all of them (rakipleri-gecme task 3).
  assert.match(src, /source:\s*sourcePhoto\?\.cutout === cutout\.uri\s*\?\s*sourcePhoto\.photo\s*:\s*cutout\.uri/);
  assert.match(src, /\.\.\.recipeSources\(recipePhotos, /);
  assert.match(src, /setSourcePhoto\(\{ cutout: next\.uri, photo \}\)/);
  assert.match(src, /samplePhotoUri\(\)/);
});

test("split scenes: every text sits right of the split edge, on the accent side", () => {
  for (const recipe of [INDIRIM, YENI_KOLEKSIYON]) {
    const spec = buildRecipeSpec(recipe, fullInput(3, "noir"));
    for (const scene of spec.scenes) {
      const edge = scene.background?.split;
      if (!edge) continue;
      const end = scene.start + 2.5;
      for (const t of spec.texts.filter((x) => x.start >= scene.start && x.start < end)) {
        const half = Math.min(textWidth(t.text, t.size, t.font, t.tracking ?? 0), 0.86) / 2;
        assert.ok(0.5 - half >= edge, `${recipe.id} "${t.text}" left edge ${0.5 - half} < split ${edge}`);
      }
    }
  }
});

// MARK: Feed shapes (4:5, 1:1) for "Hepsini çıkar"

const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const LONG_NAME = "El Yapımı Seramik Kahve Fincanı Seti 2li";
const FEED = ["4:5", "1:1"];
const r4 = (n) => Math.round(n * 10000) / 10000;

test("9:16 output matches its baseline (gaps-ui: two-line and split-edge guards in 9:16 too)", () => {
  // Hashes of JSON.stringify(spec). The first two are unchanged since before
  // `ratio` was honoured (docs/_snap/gaps-ratio/baseline-916.json); the
  // all-variants hash moved when 9:16 got the two-line and split-edge guards
  // (only long names changed).
  assert.equal(
    sha(buildRecipeSpec(YENI_KOLEKSIYON, fullInput(3, "ivory"))),
    "93aaf473e12f1175a871cc1e38ed60efac8aa1cf8037634a98f61f85f4004f1f",
  );
  assert.equal(
    sha(buildRecipeSpec(INDIRIM, fullInput(3, "ocean"))),
    "7c004383ff44c2fec0948d9297ebdac5b304c0fcafbe06647f63c5ecad8c1c7e",
  );
  const all = VARIANTS.flatMap((v) =>
    [1, 6].flatMap((n) =>
      [undefined, LONG_NAME].map((name) =>
        buildRecipeSpec(v.recipe, name ? { ...fullInput(n, v.palette), name } : fullInput(n, v.palette)),
      ),
    ),
  );
  assert.equal(sha(all), "25f95fbb0c64999284b7c547c2d30d4adf7f7ff5797d1cd345af214d0bc67862");
  // No ratio given is 9:16.
  for (const v of VARIANTS) {
    const plain = fullInput(3, v.palette);
    delete plain.ratio;
    assert.deepEqual(buildRecipeSpec(v.recipe, plain), buildRecipeSpec(v.recipe, fullInput(3, v.palette)), v.id);
  }
  const l = ratioLayout();
  assert.deepEqual([l.top, l.bottom, l.box, l.tall, l.text, l.y(0.37)], [0.14, 0.8, false, 1, 1, 0.37]);
});

/** Problems of a 4:5 / 1:1 recipe spec (the feed post rules). */
function feedProblems(spec) {
  const l = ratioLayout(spec.ratio);
  const half = (t) => textHalfHeight(linesOf(t), t.size, t.fill !== "", l.tall);
  const out = [];
  for (const t of spec.texts) {
    if (t.y - half(t) < FEED_BAND.top - 1e-9 || t.y + half(t) > FEED_BAND.bottom + 1e-9)
      out.push(`"${t.text}" leaves the band (${t.y} +- ${half(t).toFixed(4)})`);
    if (linesOf(t) > 2) out.push(`"${t.text}" takes ${linesOf(t)} lines`);
    const max = textMaxWidth(t.size, t.fill !== "");
    for (const word of t.text.split(" "))
      if (textWidth(word, t.size, t.font ?? "system", t.tracking ?? 0) > max) out.push(`"${t.text}" word ${word} too wide`);
    // Lines stay inside the 0.06 side margins.
    if (max > 1 - 2 * FEED_BAND.side + 1e-9) out.push(`"${t.text}" line width ${max}`);
  }
  spec.scenes.forEach((s, i) => {
    const end = i + 1 < spec.scenes.length ? spec.scenes[i + 1].start : spec.duration;
    if (s.mode === "cutout") {
      for (const k of s.keys)
        if (k.y - k.scale / 2 < -1e-9 || k.y + k.scale / 2 > 1 + 1e-9) out.push(`scene ${i} product leaves the frame`);
      for (const t of spec.texts) {
        if (t.end <= s.start || t.start >= end) continue;
        for (const k of s.keys) {
          const top = k.y - k.scale / 2,
            bottom = k.y + k.scale / 2;
          if (!(t.y + half(t) <= top - PRODUCT_CLEARANCE + 1e-6 || t.y - half(t) >= bottom + PRODUCT_CLEARANCE - 1e-6))
            out.push(`"${t.text}" within ${PRODUCT_CLEARANCE} of the product in scene ${i}`);
        }
      }
    }
    // Split scenes: centred texts stay right of the edge, on the accent side.
    const edge = s.background?.split;
    if (edge)
      for (const t of spec.texts.filter((x) => x.start >= s.start && x.start < end)) {
        const w = Math.min(textWidth(t.text, t.size, t.font ?? "system", t.tracking ?? 0), 0.86) / 2;
        if (0.5 - w < edge) out.push(`"${t.text}" crosses the split edge`);
      }
  });
  spec.texts.forEach((a, i) =>
    spec.texts.slice(i + 1).forEach((b) => {
      if (a.end <= b.start || b.end <= a.start) return;
      if (Math.abs(a.y - b.y) < half(a) + half(b) - 1e-6) out.push(`"${a.text}" overlaps "${b.text}"`);
    }),
  );
  return out;
}

test("feed shapes: every variant, 1 and 6 photos, every name length, lays out in 4:5 and 1:1", () => {
  for (const ratio of FEED)
    for (const v of VARIANTS)
      for (const n of [1, 6])
        for (const name of NAMES) {
          const spec = buildRecipeSpec(v.recipe, { ...fullInput(n, v.palette), name, ratio });
          const tag = `${v.id} ${ratio} (${n} photos) "${name}"`;
          assert.equal(spec.ratio, ratio, tag);
          assert.deepEqual(specProblems(spec), [], tag);
          assert.deepEqual(feedProblems(spec), [], tag);
          assert.ok(spec.texts.some((t) => t.text === name), tag + " keeps the name");
          const floor = 0.04 * ratioLayout(ratio).text;
          assert.ok(spec.texts.every((t) => t.size >= floor - 1e-9), tag + " text size floor");
        }
});

test("feed shapes: long prices and empty fields still lay out", () => {
  for (const ratio of FEED)
    for (const r of RECIPES) {
      const long = buildRecipeSpec(r, { ...fullInput(3, "noir"), price: "1.249,90 TL", oldPrice: "1.499,90 TL", ratio });
      assert.deepEqual([...specProblems(long), ...feedProblems(long)], [], `${r.id} ${ratio} long price`);
      const bare = buildRecipeSpec(r, { ...fullInput(1, "ivory"), oldPrice: "", badge: "", cta: "", ratio });
      assert.deepEqual([...specProblems(bare), ...feedProblems(bare)], [], `${r.id} ${ratio} bare`);
    }
});

test("feed shapes: short names keep the designed size times the shape's text factor", () => {
  for (const ratio of FEED) {
    const k = ratioLayout(ratio).text;
    for (const r of RECIPES) {
      const spec = buildRecipeSpec(r, { ...fullInput(6, "ivory"), name: "Gömlek", ratio });
      const designed = r.texts.filter((t) => t.field === "name");
      const built = spec.texts.filter((t) => t.text === "Gömlek");
      assert.equal(built.length, designed.length, `${r.id} ${ratio}`);
      built.forEach((t, i) => assert.equal(t.size, r4(designed[i].size * k), `${r.id} ${ratio}`));
    }
  }
});

test("feed shapes: products keep their size (1:1 grows up to 15 %), photos their point with more zoom, depth pushes in", () => {
  for (const ratio of FEED) {
    const l = ratioLayout(ratio);
    for (const r of RECIPES) {
      const tall = buildRecipeSpec(r, fullInput(6, "ivory"));
      const feed = buildRecipeSpec(r, { ...fullInput(6, "ivory"), ratio });
      assert.equal(feed.scenes.length, tall.scenes.length, r.id);
      feed.scenes.forEach((s, i) => {
        const was = tall.scenes[i];
        const tag = `${r.id} ${ratio} scene ${i}`;
        assert.equal(s.mode, was.mode, tag);
        assert.deepEqual(s.background, was.background, tag);
        s.keys.forEach((k, j) => {
          const w = was.keys[j];
          assert.equal(k.t, w.t, tag);
          assert.equal(k.x, w.x, tag);
          if (s.mode === "cutout") {
            if (ratio === "4:5") assert.equal(k.scale, w.scale, tag + " product size");
            else {
              assert.ok(k.scale >= w.scale - 1e-9, tag + " product never shrinks");
              assert.ok(k.scale <= r4(w.scale * 1.15) + 1e-9, tag + " grows at most 15 %");
            }
          }
          else {
            assert.equal(k.y, w.y, tag + " photo point");
            if (s.mode === "photo") assert.equal(k.scale, r4(Math.min(3, Math.max(1, w.scale) * l.zoom)), tag);
            else assert.ok((k.scale > w.scale || w.scale >= 1.4) && k.scale <= 1.4, tag + " dolly");
          }
        });
        if (s.mode === "depth")
          s.keys.forEach((k, j) => j && assert.equal(Math.sign(k.scale - s.keys[j - 1].scale), Math.sign(was.keys[j].scale - was.keys[j - 1].scale), "dolly direction"));
      });
      // The end card keeps its 44 %+ product, fully in frame and clear of its texts.
      const last = feed.scenes.at(-1);
      assert.ok(last.keys.at(-1).scale >= 0.44, r.id + " end card");
    }
  }
  assert.equal(ratioLayout("4:5").zoom, 1.1);
  assert.equal(ratioLayout("1:1").zoom, 1.2);
  assert.deepEqual(FEED_BAND, { top: 0.08, bottom: 0.92, side: 0.06 });
});

test("feed shapes: split-scene texts sit right of the edge, on the accent side", () => {
  for (const ratio of FEED)
    for (const recipe of [INDIRIM, YENI_KOLEKSIYON])
      for (const price of ["349 TL", "1.249,90 TL", "12.499,90 TL"]) {
        const spec = buildRecipeSpec(recipe, { ...fullInput(3, "noir"), price, ratio });
        const split = spec.scenes.filter((s) => s.background?.split);
        assert.ok(split.length >= 1, recipe.id);
        for (const scene of split) {
          assert.equal(scene.background.split, SPLIT_EDGE);
          const end = spec.scenes[spec.scenes.indexOf(scene) + 1]?.start ?? spec.duration;
          const on = spec.texts.filter((x) => x.start >= scene.start && x.start < end);
          assert.ok(on.length >= 1, `${recipe.id} ${ratio} has texts on the split scene`);
          for (const t of on) {
            const half = Math.min(textWidth(t.text, t.size, t.font, t.tracking ?? 0), 0.86) / 2;
            assert.ok(0.5 - half >= SPLIT_EDGE, `${recipe.id} ${ratio} "${t.text}" left edge ${0.5 - half}`);
            assert.equal(t.color, paletteById("noir").onAccent, `${recipe.id} ${ratio} "${t.text}" accent-side colour`);
          }
        }
      }
});

// MARK: gaps-ui: 9:16 guards, square product growth, dropped texts

test("9:16: every variant keeps every text to two lines and right of the split edge", () => {
  for (const v of VARIANTS)
    for (const name of NAMES)
      for (const price of ["349 TL", "12.499,90 TL"]) {
        const spec = buildRecipeSpec(v.recipe, { ...fullInput(6, v.palette), name, price });
        const tag = `${v.id} "${name}" ${price}`;
        assert.deepEqual(specProblems(spec), [], tag);
        for (const t of spec.texts) assert.ok(linesOf(t) <= 2, `${tag} "${t.text}" ${linesOf(t)} lines`);
        spec.scenes.forEach((s, i) => {
          const edge = s.background?.split;
          if (!edge) return;
          const end = spec.scenes[i + 1]?.start ?? spec.duration;
          for (const t of spec.texts.filter((x) => x.start >= s.start && x.start < end)) {
            const half = Math.min(textWidth(t.text, t.size, t.font ?? "system", t.tracking ?? 0), 0.86) / 2;
            assert.ok(0.5 - half >= edge - 1e-9, `${tag} "${t.text}" crosses the edge`);
          }
        });
        assert.equal(spec.dropped, undefined, tag + " nothing left out");
      }
});

test("1:1: hero products grow by up to 15 % where texts stay 0.025 clear", () => {
  let full = 0;
  for (const r of RECIPES) {
    const feed = buildRecipeSpec(r, { ...fullInput(6, "ivory"), ratio: "4:5" });
    const square = buildRecipeSpec(r, { ...fullInput(6, "ivory"), ratio: "1:1" });
    assert.deepEqual(feedProblems(square), [], r.id);
    square.scenes.forEach((s, i) => {
      if (s.mode !== "cutout") return;
      const grow = Math.max(...s.keys.map((k) => k.scale)) / Math.max(...feed.scenes[i].keys.map((k) => k.scale));
      assert.ok(grow >= 1 - 1e-9 && grow <= 1.15 + 1e-3, `${r.id} scene ${i} ${grow}`);
      if (grow > 1.149) full++;
    });
    // The end card has room: its product is the full 15 % larger.
    const end = square.scenes.at(-1).keys.at(-1).scale,
      was = feed.scenes.at(-1).keys.at(-1).scale;
    assert.ok(Math.abs(end - r4(was * 1.15)) < 1e-3, `${r.id} end card ${was} -> ${end}`);
  }
  assert.ok(full >= RECIPES.length, "most heroes grow the full 15 %");
});

test("dropped texts: over the text limit or with no room, listed in spec.dropped", () => {
  // Seven texts: the seventh (cta) is over LIMITS.maxTexts.
  const seven = mkRecipe({
    texts: [
      { field: "name", start: 0.2, end: 1, y: 0.2, size: 0.07, style },
      { field: "price", start: 1, end: 2, y: 0.2, size: 0.07, style },
      { field: "oldPrice", start: 2, end: 3, y: 0.2, size: 0.07, style },
      { field: "badge", start: 3, end: 4, y: 0.2, size: 0.07, style },
      { field: "name", start: 4, end: 5, y: 0.2, size: 0.07, style },
      { field: "price", start: 5, end: 6, y: 0.2, size: 0.07, style },
      { field: "cta", start: 6, end: 7, y: 0.2, size: 0.07, style },
    ],
  });
  const over = buildRecipeSpec(seven, mkInput({ badge: "Yeni", cta: "Al" }));
  assert.equal(over.texts.length, LIMITS.maxTexts);
  assert.deepEqual(over.dropped, ["cta"]);
  assert.deepEqual(specProblems(over), []);
  // A product filling the frame leaves no clear spot for the name.
  const full = mkRecipe({
    scenes: [mkScene(0, { mode: "cutout", keys: [key(0, 1), key(2, 1)] })],
    texts: [{ field: "name", start: 0.2, end: 3, y: 0.3, size: 0.07, style }],
  });
  const none = buildRecipeSpec(full, mkInput({ price: "", oldPrice: "" }));
  assert.equal(none.texts.length, 0);
  assert.deepEqual(none.dropped, ["name"]);
  assert.deepEqual(specProblems(none), []);
  // Empty fields are not "dropped"; a recipe with room drops nothing.
  const fine = buildRecipeSpec(mkRecipe(), mkInput({ oldPrice: "" }));
  assert.equal(fine.dropped, undefined);
});
