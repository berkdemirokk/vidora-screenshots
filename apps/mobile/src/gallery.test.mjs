// Run with: node --test apps/mobile/src/*.test.mjs
// Template gallery (rakipleri-gecme task 5): Home's shelves of recipe
// variants, the `variant` route param that selects the recipe path in the
// editor, and the photos handed over from Home.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GALLERY_CARD,
  GALLERY_SHELVES,
  HERO_COLUMN_ESTIMATE,
  HERO_MAX_SHARE,
  SHELF_HEAD,
  canStartVariant,
  compactHeroLayout,
  galleryPosterTime,
  tonedPosterTime,
  galleryShelves,
  missingPhotos,
  parsePhotosParam,
  recipeChoice,
  variantsOfRecipe,
} from "./gallery.ts";
import { RECIPES, VARIANTS, variantById } from "./recipes/index.ts";
import { buildRecipeSpec } from "./recipes/build.ts";
import { YENI_KOLEKSIYON } from "./recipes/yeni-koleksiyon.ts";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const clock = (s) => {
  const total = Math.round(s);
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
};

test("gallery shelves: Yeni, İndirim, Tanıtım hold all 30 variants once", () => {
  assert.deepEqual(
    GALLERY_SHELVES.map((s) => s.tr),
    ["Yeni", "İndirim", "Tanıtım"],
  );
  const shelves = galleryShelves();
  assert.equal(shelves.length, 3);
  const ids = shelves.flatMap((s) => s.cards.map((c) => c.variant.id));
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.deepEqual([...ids].sort(), VARIANTS.map((v) => v.id).sort());
  // Every recipe sits on exactly one shelf, its five variants together.
  for (const recipe of RECIPES) {
    const homes = shelves.filter((s) =>
      s.cards.some((c) => c.recipe.id === recipe.id),
    );
    assert.equal(homes.length, 1, recipe.id);
    assert.equal(
      homes[0].cards.filter((c) => c.recipe.id === recipe.id).length,
      5,
    );
  }
  assert.deepEqual(
    shelves.map((s) => s.cards.length),
    [10, 5, 15],
  );
  // The same data on every call (Home renders it many times).
  assert.equal(galleryShelves(), shelves);
});

test("gallery cards: photo counts and lengths come from the recipe", () => {
  for (const card of galleryShelves().flatMap((s) => s.cards)) {
    const { recipe, variant } = card;
    assert.equal(card.minPhotos, recipe.minPhotos, variant.id);
    assert.equal(card.maxPhotos, recipe.maxPhotos, variant.id);
    assert.ok(card.minPhotos >= 1 && card.maxPhotos <= 8, variant.id);
    const spec = buildRecipeSpec(variant.recipe, {
      photos: ["file:///p.jpg"],
      cutouts: ["file:///c.png"],
      name: "Lavanta Yağı",
      price: "349 TL",
      oldPrice: "449 TL",
      badge: "Yeni sezon",
      cta: "Hemen al",
      palette: variant.palette,
      ratio: "9:16",
      quality: "720p",
    });
    assert.equal(card.seconds, spec.duration, variant.id);
    assert.ok(card.seconds >= 8 && card.seconds <= 15, variant.id);
    assert.equal(card.clock, clock(spec.duration), variant.id);
    assert.match(card.clock, /^0:\d\d$/);
    // The poster moment is inside the video, after the first beat.
    const at = galleryPosterTime(recipe.id, card.seconds);
    assert.ok(at > 0 && at < card.seconds, variant.id);
  }
  const once = galleryShelves()
    .flatMap((s) => s.cards)
    .find((c) => c.recipe.id === "once-sonra");
  assert.equal(once.minPhotos, 2);
  assert.equal(once.maxPhotos, 2);
});

test("variant param chooses the recipe path; no variant keeps buildSpec", () => {
  const v = variantById("indirim-2");
  const chosen = recipeChoice("indirim-2", false);
  assert.equal(chosen.recipe, v.recipe);
  assert.equal(chosen.palette, v.palette);
  assert.equal(chosen.variant, v);
  // No variant (or one this build does not know): the classic templates.
  assert.equal(recipeChoice(null, false), null);
  assert.equal(recipeChoice(undefined, false), null);
  assert.equal(recipeChoice("nope-9", false), null);
  // QA_RECIPE stays an override when no variant is chosen: Yeni Koleksiyon
  // in the editor's own palette (null).
  const qa = recipeChoice(null, true);
  assert.equal(qa.recipe, YENI_KOLEKSIYON);
  assert.equal(qa.palette, null);
  assert.equal(qa.variant, undefined);
  // A real variant wins over the QA override.
  assert.equal(recipeChoice("kombin-3", true).variant.id, "kombin-3");
  // The Şablon panel's variants are the five of the same recipe.
  assert.deepEqual(
    variantsOfRecipe("kombin").map((x) => x.id),
    ["kombin-1", "kombin-2", "kombin-3", "kombin-4", "kombin-5"],
  );
});

test("photos handed over from Home: files in the cache only, at most 8", () => {
  const CACHE = "file:///var/app/Library/Caches/";
  const list = Array.from(
    { length: 10 },
    (_, i) => `${CACHE}ImagePicker/p${i}.jpg`,
  );
  assert.deepEqual(parsePhotosParam(JSON.stringify(list), CACHE), list.slice(0, 8));
  assert.deepEqual(parsePhotosParam(undefined, CACHE), []);
  assert.deepEqual(parsePhotosParam("", CACHE), []);
  assert.deepEqual(parsePhotosParam("not json", CACHE), []);
  assert.deepEqual(parsePhotosParam(JSON.stringify({ a: 1 }), CACHE), []);
  assert.deepEqual(
    parsePhotosParam(
      JSON.stringify([
        "https://x.test/a.jpg",
        4,
        "file:///var/app/Documents/KareviaMedia/x.jpg",
        `${CACHE}ImagePicker/../../Documents/y.jpg`,
        CACHE,
        `${CACHE}ImagePicker/ok.heic`,
      ]),
      CACHE,
    ),
    [`${CACHE}ImagePicker/ok.heic`],
  );
  // No allowed folder known: nothing is accepted.
  assert.deepEqual(parsePhotosParam(JSON.stringify(list), ""), []);
  // expo-router may hand a repeated param over as an array.
  assert.deepEqual(
    parsePhotosParam([JSON.stringify([`${CACHE}a.jpg`])], CACHE),
    [`${CACHE}a.jpg`],
  );
});

test("Önce/Sonra never starts with one photo", () => {
  const once = variantById("once-sonra-1");
  assert.equal(missingPhotos(once.recipe, 1), 1);
  assert.equal(missingPhotos(once.recipe, 0), 2);
  assert.equal(missingPhotos(once.recipe, 2), 0);
  assert.equal(canStartVariant(once, 1), false);
  assert.equal(canStartVariant(once, 2), true);
  // One-photo recipes start with one.
  assert.equal(canStartVariant(variantById("indirim-1"), 1), true);
  assert.equal(missingPhotos(variantById("kombin-1").recipe, 3), 0);
});

test("Home's hero leaves the first shelf on screen", () => {
  // Tab bar (49) + bottom safe area.
  const cases = [
    { width: 390, height: 844, safeTop: 47, bottom: 34 },
    { width: 375, height: 667, safeTop: 20, bottom: 0 },
    { width: 430, height: 932, safeTop: 59, bottom: 34 },
  ];
  for (const c of cases) {
    const h = compactHeroLayout(c);
    const label = `${c.width}x${c.height}`;
    assert.ok(h.posterWidth > 100 && h.columnWidth >= 150, label);
    assert.equal(h.posterHeight, Math.round((h.posterWidth * 16) / 9), label);
    // The hero block itself stays within 45 % of the screen.
    assert.ok(h.heroHeight <= Math.floor(c.height * HERO_MAX_SHARE), label);
    const galleryTop = Math.max(h.heroHeight, h.top + HERO_COLUMN_ESTIMATE);
    const cardsTop = galleryTop + SHELF_HEAD;
    const visibleBottom = c.height - 49 - c.bottom;
    // The shelf title and the top of its cards show.
    assert.ok(cardsTop + 40 < visibleBottom, label);
    if (c.height >= 844) {
      // On a 6.1" phone and up: two whole posters side by side.
      assert.ok(cardsTop + GALLERY_CARD.posterHeight <= visibleBottom, label);
      assert.ok(20 + 2 * GALLERY_CARD.width + GALLERY_CARD.gap <= c.width, label);
      assert.ok(h.heroHeight <= c.height * 0.45, label);
    }
  }
  // Odd input never gives NaN.
  for (const v of Object.values(compactHeroLayout({ width: NaN, height: NaN, safeTop: NaN })))
    assert.ok(Number.isFinite(v));
});

test("create.tsx: the variant param selects the recipe, the old path stays", () => {
  const src = read("../app/create.tsx");
  assert.match(src, /variant\?: string;/);
  assert.match(src, /recipeChoice\(variantId, QA_RECIPE && !classicChosen\)/);
  assert.match(src, /const isRecipe = !!recipeUsed && !!cutout;/);
  const memo = src.slice(
    src.indexOf("const spec = useMemo("),
    src.indexOf("const specDuration"),
  );
  assert.match(memo, /buildRecipeSpec\(recipeUsed\.recipe, \{/);
  assert.match(memo, /palette: recipeUsed\.palette \?\? palette/);
  assert.match(memo, /guardAiScene\(\s*buildSpec\(\{/);
  assert.doesNotMatch(src, /YENI_KOLEKSIYON/);
  // Photos picked on Home (cache files only): photo 1 is cut out, the rest
  // are added photos, set first so they survive a failed first cut-out.
  assert.match(src, /parsePhotosParam\(params\.photos, Paths\.cache\.uri\)/);
  const effect = src.slice(src.indexOf("const photosStarted"), src.indexOf("const openPhoto"));
  assert.ok(effect.indexOf("setExtras(") < effect.indexOf("openPhoto(picked[0])"));
  assert.match(src, /canStartVariant\(/);
  // Drafts keep the variant and photo 1's original photo.
  assert.match(src, /variant: variantId/);
  assert.match(src, /photo: photo0/);
  assert.match(src, /state\.photo \? \{ cutout: cutoutUri, photo: state\.photo \}/);
  // The dead one-photo note is gone.
  assert.doesNotMatch(src, /Bu şablon yalnız ilk fotoğrafı kullanır/);
});

test("Home: gallery cards are plain Pressables that pick photos first", () => {
  const home = read("../app/(tabs)/(studio)/index.tsx");
  assert.match(home, /<TemplateGallery/);
  assert.match(home, /pickProductPhotos\(variant\.recipe\.maxPhotos\)/);
  assert.match(home, /if \(photos\.length === 0\) return;/);
  assert.match(home, /variant: variant\.id/);
  // Hero actions still there.
  assert.match(home, /testID="home-create"/);
  assert.match(home, /Örnekle dene/);
  const gallery = read("./studio/template-gallery.tsx");
  assert.doesNotMatch(gallery, /<Link\b|\basChild[=\s>]/);
  assert.doesNotMatch(gallery, /from "expo-router"/);
  assert.match(gallery, /<Pressable/);
  // Posters: cached by variant id and revision, drawn lazily.
  const posters = read("./gallery-posters.ts");
  assert.match(posters, /"vidora-gallery"/);
  assert.match(posters, /`\$\{id\}-\$\{rev\}/);
  assert.match(posters, /nativePreviewQueue\.enqueue\(/);
  // Fix round 1: small posters, build number in the key, prune after mount.
  assert.match(posters, /POSTER_WIDTH = 360/);
  assert.match(posters, /buildNumber/);
  assert.match(posters, /export function pruneGalleryPosters/);
  assert.match(gallery, /useEffect\(\(\) => \{\s*pruneGalleryPosters\(\)/);
  // The first shelf draws at once, the others after a scroll.
  assert.match(gallery, /armed=\{i === 0 \|\| armed\}/);
  assert.match(gallery, /export const TemplateGallery = memo\(/);
});

test("Home: stable gallery callbacks, Önce/Sonra asks for 2 photos, compact hero", () => {
  const home = read("../app/(tabs)/(studio)/index.tsx");
  assert.match(home, /const pickVariant = useCallback\(/);
  assert.match(home, /const sampleVariant = useCallback\(/);
  assert.match(home, /missingPhotos\(variant\.recipe, photos\.length\)/);
  assert.match(home, /Bu şablon için \$\{need\} fotoğraf seç: önce ve sonra\./);
  assert.match(home, /"Fotoğraf ekle"/);
  assert.match(home, /"Vazgeç"/);
  assert.match(home, /compactHeroLayout\(/);
  // The hero video pauses when it scrolls out of view.
  assert.match(home, /heroVisible/);
  assert.match(home, /if \(!reduceMotion && playing\) player\.play\(\)/);
  // A card whose recipe needs 2 photos offers no one-photo sample.
  const gallery = read("./studio/template-gallery.tsx");
  assert.match(gallery, /card\.minPhotos <= 1 \?/);
});

test("variant posters show a toned scene in the variant's palette, with a text on screen", () => {
  for (const v of VARIANTS) {
    const spec = buildRecipeSpec(v.recipe, {
      photos: ["file:///p.jpg"],
      cutouts: ["file:///c.png"],
      name: "Lavanta Yağı",
      price: "349 TL",
      oldPrice: "449 TL",
      badge: "Yeni sezon",
      cta: "Hemen al",
      palette: v.palette,
      ratio: "9:16",
      quality: "720p",
    });
    const at = tonedPosterTime(v.recipe, spec);
    assert.ok(at > 0 && at < spec.duration, v.id);
    if (v.recipe.id === "once-sonra") {
      // No toned scene: the recipe's own moment.
      assert.equal(at, galleryPosterTime(v.recipe.id, spec.duration), v.id);
      continue;
    }
    const k = spec.scenes.findLastIndex((s) => s.start <= at);
    const scene = spec.scenes[k];
    assert.equal(scene.mode, "cutout", v.id);
    assert.ok(["accent", "split", "dark"].includes(v.recipe.scenes[k].tone), `${v.id} tone ${v.recipe.scenes[k].tone}`);
    assert.ok(scene.background, v.id + " palette background");
    // A text shows too, when any toned scene has one (Kombin's dark scene has none).
    const tonedText = spec.scenes.some((s, i) => {
      const end = spec.scenes[i + 1]?.start ?? spec.duration;
      return s.background && v.recipe.scenes[i].tone !== "light" && spec.texts.some((t) => t.start < end && t.end > s.start);
    });
    if (tonedText) assert.ok(spec.texts.some((t) => t.start <= at && t.end > at), v.id + " a text shows");
  }
  const posters = read("./gallery-posters.ts");
  assert.match(posters, /at: tonedPosterTime\(variant\.recipe, spec\)/);
  assert.match(posters, /const GALLERY_REVISION = 2;/);
});
