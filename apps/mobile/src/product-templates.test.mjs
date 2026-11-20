// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FONT_STYLE,
  FONT_STYLES,
  LIMITS,
  PALETTES,
  RATIOS,
  TEMPLATES,
  ALL_RATIOS,
  CLOSE_UP,
  CLOSE_UP_MARGIN,
  closeUpProblems,
  MIN_PRODUCT_SHARE,
  MIN_SOCIAL_PRODUCT,
  SOCIAL_SAFE,
  safeAreaProblems,
  PHOTO_LIMITS,
  buildMainImageSpec,
  FONT_SAMPLE_FAMILY,
  FONT_SIZE_FACTOR,
  textHeight,
  textWidth,
  mainImageFit,
  posterTime,
  stillEnlargement,
  upperFor,
  photoWarnings,
  isWholePhotoCutout,
  fallbackErrorText,
  sceneCrop,
  stillSize,
  textColorsForScene,
  TEXT_CLEARANCE,
  buildSpec,
  clearanceProblems,
  frameSize,
  poseAt,
  textLines,
  textOverlapProblems,
  layoutForRatio,
  ratioHeight,
  sceneForRatio,
  specProblems,
  upperTr,
} from "./product-templates.ts";

const VIDEO_KIND_IDS = [
  "promotion",
  "advertisement",
  "usage",
  "packaging",
  "assembly",
  "store",
];

const base = {
  template: "showcase",
  palette: "noir",
  product: "file:///tmp/product.png",
  headline: "Gül & Amber Eau de Parfum",
  price: "1.249 TL",
  badge: "%30 indirim",
  cta: "Hemen sipariş ver",
  quality: "1080p",
  watermark: false,
  music: null,
};

test("every template and palette builds a valid spec", () => {
  for (const template of TEMPLATES)
    for (const palette of PALETTES) {
      const spec = buildSpec({
        ...base,
        template: template.id,
        palette: palette.id,
      });
      assert.deepEqual(specProblems(spec), [], template.id + "/" + palette.id);
      assert.equal(spec.duration, template.duration);
    }
});

test("durations meet Trendyol's 8 second minimum", () => {
  for (const template of TEMPLATES)
    assert.ok(
      template.duration >= LIMITS.minDuration && template.duration <= 30,
    );
});

test("empty texts are left out", () => {
  const spec = buildSpec({
    ...base,
    headline: "  ",
    price: "",
    badge: "",
    cta: "",
  });
  assert.equal(spec.texts.length, 0);
  assert.deepEqual(specProblems(spec), []);
});

test("badge uses Turkish upper case", () => {
  assert.equal(upperTr("%30 indirim ılık"), "%30 İNDİRİM ILIK");
  const spec = buildSpec(base);
  assert.ok(spec.texts.some((t) => t.text === "%30 İNDİRİM"));
});

test("long text is trimmed to the limit", () => {
  const spec = buildSpec({ ...base, headline: "a".repeat(200) });
  assert.ok(spec.texts.every((t) => t.text.length <= LIMITS.maxTextLength));
  assert.deepEqual(specProblems(spec), []);
});

test("invalid specs are reported", () => {
  const spec = buildSpec(base);
  assert.ok(specProblems({ ...spec, duration: 4 }).includes("duration"));
  assert.ok(
    specProblems({ ...spec, keys: [{ ...spec.keys[0], t: 1 }] }).length > 0,
  );
  assert.ok(
    specProblems({ ...spec, texts: [{ ...spec.texts[0], color: "red" }] })
      .length > 0,
  );
});

test("reflection follows the palette floor", () => {
  assert.equal(buildSpec({ ...base, palette: "ocean" }).reflection, false);
  assert.equal(buildSpec({ ...base, palette: "noir" }).reflection, true);
});

test("turntable turns within the renderer's limit", () => {
  const spec = buildSpec({ ...base, template: "turntable" });
  assert.ok(spec.keys.some((k) => Math.abs(k.yaw) > 20));
  assert.ok(spec.keys.every((k) => Math.abs(k.yaw) <= 35));
  assert.ok(
    specProblems({ ...spec, keys: [{ ...spec.keys[0], yaw: 50 }] }).length > 0,
  );
});

test("relief light is on for studio templates and off for campaign", () => {
  assert.ok(buildSpec({ ...base, template: "lightTour" }).relief > 0.5);
  assert.equal(buildSpec({ ...base, template: "campaign" }).relief, 0);
  const spec = buildSpec(base);
  assert.ok(specProblems({ ...spec, relief: 2 }).includes("relief"));
});

test("relief can be switched off for the free plan", () => {
  assert.equal(
    buildSpec({ ...base, template: "showcase", relief: false }).relief,
    0,
  );
  assert.ok(buildSpec({ ...base, template: "showcase" }).relief > 0);
});

test("an AI scene replaces the background and places the product", () => {
  const scene = {
    uri: "file:///tmp/scene.jpg",
    crop: { x: 0.21875, width: 0.5625 },
    productRect: { x: 0.2, y: 0.4, width: 0.6, height: 0.38 },
  };
  const spec = buildSpec({ ...base, template: "showcase", scene });
  assert.equal(spec.background.image, scene.uri);
  assert.equal(spec.background.floor, false);
  assert.equal(spec.reflection, false);
  // The product stands on the scene's spot: same centre line, base at most
  // 0.12 higher (to clear the texts), never larger than the scene expects.
  const rest = spec.keys[spec.keys.length - 1];
  const restBase = rest.y + rest.scale / 2;
  assert.ok(Math.abs(rest.x - 0.5) < 1e-9);
  assert.ok(restBase <= 0.78 + 0.02 + 1e-9 && restBase >= 0.78 - 0.12 - 1e-9);
  assert.ok(rest.scale <= 0.38 + 1e-9);
  assert.deepEqual(specProblems(spec), []);
  assert.equal(buildSpec(base).background.image, "");
});

// --------------------------------------------------- ratios, shots, texts --

/** Rough vertical extent of a text (frame fractions), single line. */
function textBox(t, ratio) {
  const perWidth = t.size * 1.2 + (t.fill ? t.size * 0.7 : 0);
  const h = perWidth / ratioHeight(ratio);
  return [t.y - h / 2, t.y + h / 2];
}

/** Total overlap of texts that are on screen at the same time. */
function textOverlap(spec, ratio) {
  let sum = 0;
  for (const [i, a] of spec.texts.entries())
    for (const b of spec.texts.slice(i + 1)) {
      if (a.end <= b.start || b.end <= a.start) continue;
      const [a0, a1] = textBox(a, ratio),
        [b0, b1] = textBox(b, ratio);
      sum += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    }
  return sum;
}

const full = { ...base, store: "Lavanta Atölye", oldPrice: "1.799 TL" };
const square = {
  uri: "file:///tmp/scene.jpg",
  crop: { x: 0.21875, width: 0.5625 },
  productRect: { x: 0.2, y: 0.4, width: 0.6, height: 0.38 },
};

test("frame sizes per ratio and quality", () => {
  assert.deepEqual(frameSize(undefined, "720p"), { width: 720, height: 1280 });
  assert.deepEqual(frameSize("9:16", "1080p"), { width: 1080, height: 1920 });
  assert.deepEqual(frameSize("4:5", "720p"), { width: 864, height: 1080 });
  assert.deepEqual(frameSize("4:5", "1080p"), { width: 1080, height: 1350 });
  assert.deepEqual(frameSize("1:1", "720p"), { width: 720, height: 720 });
  assert.deepEqual(frameSize("1:1", "1080p"), { width: 1080, height: 1080 });
  for (const ratio of RATIOS)
    for (const q of ["720p", "1080p"]) {
      const s = frameSize(ratio, q);
      assert.ok(s.width % 2 === 0 && s.height % 2 === 0, "even for H.264");
      assert.ok(Math.abs(s.height / s.width - ratioHeight(ratio)) < 1e-9);
    }
});

test("9:16 layout is unchanged by the ratio mapping", () => {
  const l = layoutForRatio("9:16");
  assert.equal(l.text, 1);
  assert.equal(l.edge, 1);
  assert.equal(l.product, 1);
  assert.equal(l.textY(0.13), 0.13);
  assert.equal(l.productY(0.47), 0.47);
  const spec = buildSpec(base);
  assert.equal(spec.ratio, "9:16");
  assert.deepEqual(buildSpec({ ...base, ratio: "9:16" }).keys, spec.keys);
});

test("every template and ratio builds a valid spec", () => {
  for (const template of TEMPLATES)
    for (const ratio of RATIOS)
      for (const input of [base, full]) {
        const spec = buildSpec({ ...input, template: template.id, ratio });
        assert.deepEqual(specProblems(spec), [], template.id + " " + ratio);
        assert.equal(spec.ratio, ratio);
      }
});

test("ratio layout keeps texts inside, in order and no more crowded", () => {
  for (const template of TEMPLATES)
    for (const input of [base, full]) {
      const tall = buildSpec({ ...input, template: template.id });
      const tallOverlap = textOverlap(tall, "9:16");
      for (const ratio of ["4:5", "1:1"]) {
        const spec = buildSpec({ ...input, template: template.id, ratio });
        const name = template.id + " " + ratio;
        assert.equal(spec.texts.length, tall.texts.length, name);
        for (const [i, t] of spec.texts.entries()) {
          const [top, bottom] = textBox(t, ratio);
          assert.ok(top >= 0 && bottom <= 1, name + " " + t.text);
          assert.ok(t.size < tall.texts[i].size, name + " smaller type");
          for (const [j, u] of spec.texts.entries())
            if (tall.texts[i].y < tall.texts[j].y)
              assert.ok(t.y < u.y, name + " order");
        }
        assert.ok(
          textOverlap(spec, ratio) <= tallOverlap + 0.005,
          name + " overlap",
        );
      }
    }
});

test("ratio layout keeps the resting product between the text bands", () => {
  for (const template of TEMPLATES)
    for (const ratio of RATIOS) {
      const spec = buildSpec({ ...base, template: template.id, ratio });
      const rest = spec.keys[spec.keys.length - 1];
      const top = rest.y - rest.scale / 2,
        bottom = rest.y + rest.scale / 2;
      assert.ok(top > 0.05 && bottom < 0.95, template.id + " " + ratio);
      const tall = buildSpec({ ...base, template: template.id });
      const tallRest = tall.keys[tall.keys.length - 1];
      if (ratio !== "9:16") assert.ok(rest.scale < tallRest.scale);
    }
});

test("a product flying in from off screen stays off screen", () => {
  for (const ratio of RATIOS) {
    const first = buildSpec({ ...base, template: "campaign", ratio }).keys[0];
    assert.ok(first.y - first.scale / 2 >= 0.9, ratio);
  }
});

test("scenes in other ratios use a wider column of the square image", () => {
  assert.equal(sceneForRatio(square, "9:16"), square);
  const sq = sceneForRatio(square, "1:1");
  assert.ok(Math.abs(sq.crop.x) < 1e-9 && Math.abs(sq.crop.width - 1) < 1e-9);
  // Same place in the image: x 0.21875 + 0.2 * 0.5625 = 0.33125.
  assert.ok(Math.abs(sq.productRect.x - 0.33125) < 1e-9);
  assert.ok(Math.abs(sq.productRect.width - 0.3375) < 1e-9);
  assert.equal(sq.productRect.y, 0.4);
  const portrait = sceneForRatio(square, "4:5");
  assert.ok(Math.abs(portrait.crop.width - 0.8) < 1e-9);
  assert.ok(Math.abs(portrait.crop.x - 0.1) < 1e-9);
  for (const ratio of RATIOS) {
    const spec = buildSpec({ ...base, scene: square, ratio });
    assert.deepEqual(specProblems(spec), [], ratio);
    assert.ok(spec.background.imageX + spec.background.imageWidth <= 1 + 1e-9);
  }
});

test("showcase and light tour cut hero, close-up and end card", () => {
  for (const id of ["showcase", "lightTour"]) {
    // A bottle-shaped cut-out (a square one is already 80% wide at rest).
    const spec = buildSpec({
      ...base,
      template: id,
      productSize: { width: 540, height: 1000 },
    });
    const shots = spec.shots ?? [];
    assert.equal(shots.length, 3, id);
    assert.equal(shots[0].zoom, 1);
    assert.ok(shots[1].zoom >= 1.1, id + " close-up");
    assert.equal(shots[2].zoom, 1);
    // Texts that leave early do so by the close-up, with an exit.
    for (const t of spec.texts.filter((t) => t.end < spec.duration)) {
      assert.ok(t.end <= shots[1].t, id + " " + t.text);
      assert.ok(t.exit, id + " exit");
    }
    // The price block belongs to the end card.
    const price = spec.texts.find((t) => t.text === base.price);
    assert.ok(price && price.start >= shots[2].t, id + " price");
  }
});

test("shots, ratio and finish are validated", () => {
  const spec = buildSpec({ ...base, template: "campaign" });
  const shot = { t: 1, zoom: 1.5, focusX: 0, focusY: 0 };
  assert.deepEqual(specProblems({ ...spec, shots: [shot] }), []);
  for (const bad of [
    { zoom: 3 },
    { zoom: 0.8 },
    { t: 99 },
    { focusY: 2 },
    { t: Number.NaN },
  ])
    assert.ok(specProblems({ ...spec, shots: [{ ...shot, ...bad }] }).length);
  assert.ok(specProblems({ ...spec, shots: [shot, { ...shot }] }).length > 0);
  assert.ok(specProblems({ ...spec, ratio: "16:9" }).includes("ratio"));
  assert.ok(
    specProblems({ ...spec, look: { ...spec.look, grain: 2 } }).includes(
      "look",
    ),
  );
  const text = spec.texts[0];
  assert.ok(
    specProblems({ ...spec, texts: [{ ...text, exit: "spin" }] }).length,
  );
  assert.ok(specProblems({ ...spec, texts: [{ ...text, strike: 1 }] }).length);
});

test("specs without the new fields stay valid", () => {
  const spec = buildSpec({ ...base, template: "campaign" });
  const old = { ...spec };
  delete old.ratio;
  delete old.shots;
  delete old.look;
  old.texts = spec.texts.map((t) => {
    const copy = { ...t };
    delete copy.exit;
    delete copy.strike;
    return copy;
  });
  assert.deepEqual(specProblems(old), []);
});

test("old price is struck through near the price on every template", () => {
  for (const template of TEMPLATES) {
    const spec = buildSpec({ ...full, template: template.id });
    const price = spec.texts.find((t) => t.text === full.price);
    // The old price that stays with the price (Discount also shows it alone first).
    const old = spec.texts.find((t) => t.strike && t.end === price?.end);
    assert.ok(old && price, template.id);
    assert.equal(old.text, "1.799 TL");
    assert.ok(Math.abs(old.y - price.y) < 0.1, template.id + " near");
    assert.ok(old.size < price.size, template.id + " smaller");
    assert.ok(old.start <= price.start && old.end === price.end);
    assert.ok(spec.texts.length <= LIMITS.maxTexts);
    for (const t of spec.texts) {
      if (t === old || t.end <= old.start || old.end <= t.start) continue;
      const [a0, a1] = textBox(old, "9:16"),
        [b0, b1] = textBox(t, "9:16");
      assert.ok(
        Math.min(a1, b1) - Math.max(a0, b0) <= 0.002,
        template.id + " vs " + t.text,
      );
    }
  }
  assert.ok(!buildSpec({ ...full, price: "" }).texts.some((t) => t.strike));
  assert.ok(!buildSpec(base).texts.some((t) => t.strike));
});

test("every spec carries a finish within range", () => {
  const plain = buildSpec(base).look;
  assert.ok(plain && plain.sceneBlur === 0 && plain.grain > 0);
  const withScene = buildSpec({ ...base, scene: square }).look;
  assert.ok(withScene && withScene.sceneBlur > 0);
  assert.ok(withScene.parallax < plain.parallax);
});

// ------------------------------------------- fonts, colours, backdrops --

/** A bundled 9:16 backdrop with the product's base at 0.78 (productPlacement). */
const backdrop = {
  uri: "file:///tmp/marble-white.jpg",
  crop: { x: 0, width: 1 },
  productRect: { x: 0.32, y: 0.48, width: 0.36, height: 0.3 },
  shade: 0,
};

test("every template, palette and ratio builds a valid spec", () => {
  assert.equal(TEMPLATES.length, 10);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
  for (const template of TEMPLATES)
    for (const palette of PALETTES)
      for (const ratio of RATIOS)
        for (const input of [base, full, { ...full, scene: backdrop }]) {
          const spec = buildSpec({
            ...input,
            template: template.id,
            palette: palette.id,
            ratio,
          });
          const name = `${template.id}/${palette.id}/${ratio}`;
          assert.deepEqual(specProblems(spec), [], name);
          assert.ok(spec.texts.length <= LIMITS.maxTexts, name);
        }
});

test("new templates keep the ids stable and run 9 to 12 seconds", () => {
  const ids = TEMPLATES.map((t) => t.id);
  for (const id of [
    "showcase",
    "lightTour",
    "turntable",
    "campaign",
    "unboxing",
    "store",
  ])
    assert.ok(ids.includes(id), id);
  for (const id of ["editorial", "detail", "discount", "minimal"]) {
    const info = TEMPLATES.find((t) => t.id === id);
    assert.ok(info && info.duration >= 9 && info.duration <= 12, id);
    assert.ok(info.tr && info.en && info.descriptionTr && info.descriptionEn);
    assert.ok(VIDEO_KIND_IDS.includes(info.kind), id);
    assert.ok(DEFAULT_FONT_STYLE[id] !== "system", id);
  }
});

test("detail cuts hero, two close-ups and an end card", () => {
  const spec = buildSpec({ ...full, template: "detail" });
  const zooms = (spec.shots ?? []).map((s) => s.zoom);
  assert.deepEqual(
    zooms.map((z) => z > 1),
    [false, true, true, false],
  );
  for (const t of spec.texts.filter((t) => t.end < spec.duration))
    assert.ok(t.exit && t.end <= spec.shots[1].t);
});

test("discount strikes the old price out before the new price pops in", () => {
  const spec = buildSpec({ ...full, template: "discount" });
  const strikes = spec.texts.filter((t) => t.strike);
  const price = spec.texts.find((t) => t.text === full.price);
  assert.equal(strikes.length, 2);
  const alone = strikes.find((t) => t.end < spec.duration);
  assert.ok(alone && alone.end <= price.start && alone.exit === "pop");
  assert.ok(alone.size > strikes.find((t) => t !== alone).size);
  // Without an old price the new price comes early.
  const plain = buildSpec({ ...base, template: "discount" });
  assert.ok(plain.texts.find((t) => t.text === base.price).start < 2);
});

test("minimal uses small, widely spaced capitals", () => {
  const spec = buildSpec({ ...full, template: "minimal" });
  const head = spec.texts.find((t) => t.text === upperTr(full.headline));
  assert.ok(head && head.tracking >= 0.1 && head.size <= 0.05);
  assert.ok(spec.texts.every((t) => t.size <= 0.05));
});

test("font style: per-template default, override, sans pairing and sizes", () => {
  assert.deepEqual(
    FONT_STYLES.map((f) => f.tr),
    ["Modern", "Zarif", "Editoryal", "Güçlü", "Afiş", "Sade"],
  );
  const show = buildSpec(full);
  const headline = show.texts.find((t) => t.text === full.headline);
  const cta = show.texts.find((t) => t.text === full.cta);
  assert.equal(headline.font, "elegant");
  // Serif styles pair with the sans for pills and calls to action.
  assert.equal(cta.font, "modern");
  const impact = buildSpec({ ...full, fontStyle: "impact" });
  assert.ok(impact.texts.every((t) => t.font === "impact"));
  // Anton is set smaller than the system font at the same template size.
  const system = buildSpec({ ...full, fontStyle: "system" });
  const sizeOf = (spec) => spec.texts.find((t) => t.text === full.price).size;
  assert.ok(sizeOf(impact) < sizeOf(system));
  assert.ok(system.texts.every((t) => t.font === "system"));
  assert.ok(
    specProblems({ ...show, texts: [{ ...headline, font: "comic" }] }).length,
  );
  assert.ok(
    specProblems({ ...show, texts: [{ ...headline, tracking: 1 }] }).length,
  );
});

test("colours override the palette's text colours only", () => {
  const colors = {
    ink: "#111111",
    accent: "#222222",
    onAccent: "#EEEEEE",
    sparkle: "#DDDDDD",
  };
  const spec = buildSpec({ ...full, colors });
  const plain = buildSpec(full);
  assert.equal(
    spec.texts.find((t) => t.text === full.headline).color,
    "#111111",
  );
  assert.equal(spec.texts.find((t) => t.text === full.price).color, "#222222");
  assert.equal(spec.sparkles.color, "#DDDDDD");
  assert.deepEqual(spec.background, plain.background);
  assert.ok(
    specProblems(buildSpec({ ...full, colors: { ...colors, ink: "black" } }))
      .length,
  );
});

test("scene shade passes through and is validated", () => {
  assert.equal(buildSpec({ ...base, scene: backdrop }).background.shade, 0);
  assert.equal(buildSpec({ ...base, scene: square }).background.shade, 1);
  const spec = buildSpec({ ...base, scene: backdrop });
  assert.ok(
    specProblems({ ...spec, background: { ...spec.background, shade: 2 } })
      .length,
  );
  assert.ok(
    specProblems({
      ...spec,
      background: { ...spec.background, imageY: 0.6, imageHeight: 0.6 },
    }).length,
  );
});

test("a 9:16 backdrop keeps the product on the same image point in every ratio", () => {
  const baseY = backdrop.productRect.y + backdrop.productRect.height; // 0.78
  const centreX = backdrop.productRect.x + backdrop.productRect.width / 2;
  for (const ratio of RATIOS) {
    const s = sceneForRatio(backdrop, ratio);
    const y = s.crop.y ?? 0,
      h = s.crop.height ?? 1;
    const r = s.productRect;
    // The base and centre in image fractions are unchanged.
    assert.ok(Math.abs(y + (r.y + r.height) * h - baseY) < 1e-9, ratio);
    assert.ok(
      Math.abs(s.crop.x + (r.x + r.width / 2) * s.crop.width - centreX) < 1e-9,
    );
    // The crop has the frame's shape and stays inside the image.
    assert.ok(y >= 0 && y + h <= 1 + 1e-9, ratio);
    const shape = (s.crop.width * 9) / (h * 16); // width/height of the crop
    assert.ok(Math.abs(shape - 1 / ratioHeight(ratio)) < 1e-9, ratio);
    // The product keeps its proportions (pixel width / height).
    assert.ok(
      Math.abs(
        (r.width * frameSize(ratio, "1080p").width) /
          (r.height * frameSize(ratio, "1080p").height) -
          (backdrop.productRect.width * 1080) /
            (backdrop.productRect.height * 1920),
      ) < 1e-6,
      ratio + " aspect",
    );
    if (ratio !== "9:16") {
      // Not a centre crop: the base lands where the ratio layout puts bases.
      const l = layoutForRatio(ratio);
      assert.ok(Math.abs(r.y + r.height - l.productY(baseY)) < 1e-9, ratio);
      assert.ok(Math.abs(y - (1 - h) / 2) > 0.01, ratio + " not centred");
    }
    // The resting product stands on that spot's centre line, its base still
    // on the backdrop's surface (0.62 down) and at most 0.12 of the image
    // higher than the spot, never larger than the rect.
    const spec = buildSpec({ ...base, scene: backdrop, ratio });
    const rest = spec.keys[spec.keys.length - 1];
    const imageBase = y + (rest.y + rest.scale / 2) * h;
    assert.ok(imageBase >= baseY - 0.12 - 1e-9 && imageBase >= 0.66, ratio);
    assert.ok(imageBase <= baseY + 0.02 * h + 1e-9, ratio);
    assert.ok(rest.scale <= r.height + 1e-9, ratio);
    assert.ok(Math.abs(rest.x - (r.x + r.width / 2)) < 1e-9, ratio);
    assert.equal(spec.background.imageY, y);
    assert.equal(spec.background.imageHeight, h);
  }
});

// ------------------------------------------- QA run 12: layout and close-ups --

/** Every field filled to the editor's maxLength (60 / 30 / 30 / 30 / 40 / 30). */
const longest = {
  ...base,
  headline: "Yaz Esintisi Eau de Parfum Kadın Erkek Unisex Uzun Kalıcı 10",
  price: "12.999,99 TL Kargo Bedava Hemen",
  oldPrice: "15.999,99 TL Eski Fiyat Etiketi",
  badge: "%30 İNDİRİM SADECE BU HAFTA SONU",
  cta: "Hemen sipariş ver, yarın kapında olsun!",
  store: "Atölye Nur Parfüm ve Kozmetik M",
};
const backdropScene = {
  uri: "file:///tmp/backdrop.jpg",
  crop: { x: 0, width: 1 },
  productRect: { x: 0.32, y: 0.48, width: 0.36, height: 0.3 },
  shade: 0,
};
/** A backdrop as the app places products on it (backdrops.ts: 0.5 high, base 0.78). */
const placedBackdrop = {
  uri: "file:///tmp/backdrop.jpg",
  crop: { x: 0, width: 1 },
  productRect: { x: 0.26, y: 0.28, width: 0.48, height: 0.5 },
  shade: 0,
};

test("texts never sit on the product (every template, ratio and background)", () => {
  for (const template of TEMPLATES)
    for (const ratio of ALL_RATIOS)
      for (const scene of [null, backdropScene, placedBackdrop, square])
        for (const texts of [full, longest])
          for (const fontStyle of [undefined, "impact"]) {
            const spec = buildSpec({
              ...texts,
              template: template.id,
              ratio,
              scene,
              fontStyle,
            });
            const label = `${template.id} ${ratio} ${scene ? scene.uri : "palette"} ${texts === longest ? "longest" : "full"} ${fontStyle ?? ""}`;
            assert.deepEqual(clearanceProblems(spec), [], label);
            assert.deepEqual(textOverlapProblems(spec), [], label);
            assert.deepEqual(specProblems(spec), [], label);
            // Every field made it into the video.
            assert.ok(spec.texts.length >= 4, label);
          }
});

test("the clearance check catches a text on the product", () => {
  const spec = buildSpec({ ...full, template: "minimal" });
  const rest = spec.keys[spec.keys.length - 1];
  const onBase = spec.texts.map((t) =>
    t.text === full.price ? { ...t, y: rest.y + rest.scale / 2 } : t,
  );
  assert.ok(clearanceProblems({ ...spec, texts: onBase }).length > 0);
  // The Minimal end card of QA run 12: old price right under the base.
  const minimal = buildSpec({
    ...full,
    template: "minimal",
    scene: backdropScene,
  });
  const old = minimal.texts.find((t) => t.strike);
  const r = minimal.keys[minimal.keys.length - 1];
  assert.ok(old.y - (r.y + r.scale / 2) > TEXT_CLEARANCE);
});

test("long texts shrink to two headline lines and one line elsewhere", () => {
  for (const template of TEMPLATES) {
    const spec = buildSpec({ ...longest, template: template.id });
    for (const t of spec.texts) {
      const headline =
        t.text === longest.headline || t.text === upperTr(longest.headline);
      assert.ok(textLines(t) <= (headline ? 2 : 1), template.id + " " + t.text);
    }
  }
});

test("close-ups keep the product in frame and never upscale it too far", () => {
  const sizes = [
    { width: 540, height: 1000 },
    { width: 1000, height: 1000 },
    { width: 1600, height: 900 },
    { width: 300, height: 640 },
    null,
  ];
  for (const template of TEMPLATES)
    for (const ratio of RATIOS)
      for (const productSize of sizes)
        for (const quality of ["720p", "1080p"]) {
          const spec = buildSpec({
            ...full,
            template: template.id,
            ratio,
            quality,
            productSize,
          });
          const size = productSize ?? { width: 1000, height: 1000 };
          const aspect = size.width / size.height;
          const rh = ratioHeight(ratio);
          const maxScale = Math.max(...spec.keys.map((k) => k.scale));
          const fit = Math.min(1, 0.9 / (maxScale * rh * aspect));
          const camMax = Math.max(spec.camera.zoomFrom, spec.camera.zoomTo);
          const shots = spec.shots ?? [];
          const detail = template.id === "detail";
          const label = `${template.id} ${ratio} ${quality} ${size.width}x${size.height}`;
          shots.forEach((shot, i) => {
            if (shot.zoom <= 1) return;
            const end = shots[i + 1]?.t ?? spec.duration;
            for (let t = shot.t + 0.05; t <= end; t += 0.1) {
              const h = poseAt(spec.keys, t).scale * fit * shot.zoom * camMax;
              const w = h * aspect * rh;
              assert.ok(
                w <=
                  (detail ? CLOSE_UP.detailMaxWidth : CLOSE_UP.maxWidth) + 1e-3,
                label + " width",
              );
              const pixels = h * frameSize(ratio, quality).height;
              assert.ok(
                pixels <= CLOSE_UP.maxUpscale * size.height + 1,
                label + " upscale",
              );
              if (!detail)
                assert.ok(
                  (0.5 + Math.abs(shot.focusY)) * h <= 0.5,
                  label + " in frame",
                );
              // No text is on screen during a close-up.
              for (const text of spec.texts)
                assert.ok(t < text.start || t > text.end, label + " text");
            }
          });
        }
});

test("Detay looks at the upper third and the label", () => {
  const spec = buildSpec({
    ...full,
    template: "detail",
    productSize: { width: 1200, height: 2400 },
  });
  const close = (spec.shots ?? []).filter((s) => s.zoom > 1);
  assert.equal(close.length, 2);
  assert.ok(close[0].focusY < -0.1 && close[0].focusY > -0.34);
  assert.equal(close[1].focusY, 0);
  // A big cut-out may go past the frame edges (up to 130% wide).
  assert.ok(close[0].zoom > 1.5);
});

test("sparkles: none on scenes, only where a template is built on them", () => {
  for (const template of TEMPLATES)
    for (const scene of [backdropScene, square])
      assert.equal(
        buildSpec({ ...full, template: template.id, scene }).sparkles,
        null,
        template.id,
      );
  const withSparkles = TEMPLATES.filter(
    (t) => buildSpec({ ...full, template: t.id }).sparkles,
  ).map((t) => t.id);
  assert.deepEqual(withSparkles.sort(), ["showcase", "unboxing"]);
  for (const id of withSparkles)
    assert.ok(buildSpec({ ...full, template: id }).sparkles.count <= 30);
});

// ------------------------------- marketplace images, own photo, photo check --

test("2:3 frames, still sizes and limits", () => {
  assert.deepEqual(frameSize("2:3", "720p"), { width: 720, height: 1080 });
  assert.deepEqual(frameSize("2:3", "1080p"), { width: 1080, height: 1620 });
  assert.equal(ratioHeight("2:3"), 1.5);
  assert.ok(!RATIOS.includes("2:3") && ALL_RATIOS.includes("2:3"));
  assert.deepEqual(stillSize("2:3", 1200), { width: 1200, height: 1800 });
  assert.deepEqual(stillSize("1:1", 1500), { width: 1500, height: 1500 });
  assert.deepEqual(stillSize("1:1", 2000), { width: 2000, height: 2000 });
  assert.deepEqual(stillSize("4:5", 1080), { width: 1080, height: 1350 });
  assert.equal(stillSize("1:1", 400), null);
  assert.equal(stillSize("1:1", 5000), null);
  assert.equal(stillSize("9:16", 2400), null); // 4267 px tall
  for (const template of TEMPLATES) {
    const spec = buildSpec({ ...full, template: template.id, ratio: "2:3" });
    assert.equal(spec.ratio, "2:3");
    assert.deepEqual(specProblems(spec), [], template.id);
  }
});

test("a marketplace main image is the product alone on white", () => {
  // Cut-outs with enough pixels for 85% of a 1080p frame (see the next test).
  for (const ratio of ["1:1", "2:3"])
    for (const productSize of [
      { width: 1080, height: 2000 },
      { width: 3200, height: 1800 },
      { width: 2000, height: 2000 },
    ]) {
      const spec = buildMainImageSpec({
        product: "file:///tmp/p.png",
        productSize,
        ratio,
      });
      const label = ratio + " " + productSize.width;
      assert.deepEqual(specProblems(spec), [], label);
      assert.deepEqual(spec.texts, []);
      assert.equal(spec.sparkles, null);
      assert.deepEqual(spec.sweeps, []);
      assert.equal(spec.relief, 0);
      assert.equal(spec.reflection, false);
      assert.equal(spec.shadowStyle, "contact");
      const bg = spec.background;
      assert.ok(
        [bg.top, bg.bottom, bg.glow].every((c) => c === "#FFFFFF") &&
          !bg.floor &&
          bg.image === "",
      );
      assert.ok(Object.values(spec.look).every((v) => v === 0));
      // Centred; the larger side takes 85% of its frame side, the other fits.
      const k = spec.keys[0];
      assert.equal(spec.keys.length, 1);
      assert.ok(k.x === 0.5 && k.y === 0.5);
      const aspect = productSize.width / productSize.height;
      const h = k.scale, // frame heights
        w = k.scale * aspect * ratioHeight(ratio); // frame widths
      assert.ok(Math.abs(Math.max(h, w) - 0.85) < 1e-9, label);
      assert.ok(h <= 0.85 + 1e-9 && w <= 0.85 + 1e-9, label);
    }
  const plain = buildMainImageSpec({
    product: "file:///tmp/p.png",
    productSize: { width: 500, height: 900 },
    fill: 0.7,
    shadow: false,
  });
  assert.equal(plain.shadow, false);
  assert.ok(Math.abs(plain.keys[0].scale - 0.7) < 1e-9);
  assert.equal(plain.ratio, "1:1");
  assert.ok(
    specProblems({ ...plain, shadowStyle: "soft" }).includes("shadow style"),
  );
});

test("a photo of any shape works as the scene", () => {
  // Landscape: a centred column of the full height.
  const wide = sceneCrop(4032, 3024);
  assert.ok(Math.abs((wide.width * 4032) / 3024 - 9 / 16) < 1e-9);
  assert.ok(
    Math.abs(wide.x - (1 - wide.width) / 2) < 1e-9 && wide.height === 1,
  );
  // Very tall: a centred band of the full width.
  const tall = sceneCrop(1000, 3000);
  assert.ok(
    tall.width === 1 && Math.abs(1000 / (3000 * tall.height) - 9 / 16) < 1e-9,
  );
  assert.ok(Math.abs(tall.y - (1 - tall.height) / 2) < 1e-9);
  const rect = { x: 0.3, y: 0.45, width: 0.4, height: 0.3 };
  for (const [w, h] of [
    [4032, 3024],
    [3024, 4032],
    [1000, 3000],
    [1080, 1920],
  ]) {
    const scene = {
      uri: "file:///tmp/own.jpg",
      crop: sceneCrop(w, h),
      productRect: rect,
      shade: 0.5,
    };
    const imageBase = scene.crop.y + (rect.y + rect.height) * scene.crop.height;
    for (const ratio of ALL_RATIOS) {
      const label = `${w}x${h} ${ratio}`;
      const placed = sceneForRatio(scene, ratio);
      const c = placed.crop;
      const cy = c.y ?? 0,
        ch = c.height ?? 1;
      // The crop has the frame's shape in pixels and stays inside the image.
      assert.ok(
        Math.abs((c.width * w) / (ch * h) - 1 / ratioHeight(ratio)) < 1e-6,
        label + " shape",
      );
      assert.ok(c.x >= -1e-9 && c.x + c.width <= 1 + 1e-9, label);
      assert.ok(cy >= -1e-9 && cy + ch <= 1 + 1e-9, label);
      // The product's base stays on the same image point.
      const r = placed.productRect;
      assert.ok(
        Math.abs(cy + (r.y + r.height) * ch - imageBase) < 1e-9,
        label + " base",
      );
      const spec = buildSpec({
        ...full,
        scene,
        ratio,
        colors: textColorsForScene({ topLuma: 0.8, bottomLuma: 0.7 }),
      });
      assert.deepEqual(specProblems(spec), [], label);
      assert.deepEqual(clearanceProblems(spec), [], label);
      assert.equal(spec.background.shade, 0.5);
    }
  }
});

test("text colours follow the photo's text bands", () => {
  const light = textColorsForScene({ topLuma: 0.85, bottomLuma: 0.7 });
  const dark = textColorsForScene({ topLuma: 0.2, bottomLuma: 0.3 });
  const mixed = textColorsForScene({ topLuma: 0.9, bottomLuma: 0.3 });
  assert.equal(light.ink, "#1A1A1A");
  assert.equal(dark.ink, "#FFFFFF");
  assert.equal(mixed.ink, "#FFFFFF");
  for (const c of [light, dark])
    assert.ok(c.accent !== c.onAccent && /^#[0-9A-F]{6}$/.test(c.onAccent));
});

test("photo warnings: blurry, dark, small, and none for a good photo", () => {
  const good = {
    width: 1400,
    height: 2000,
    quality: { sharpness: 180, brightness: 0.48 },
  };
  assert.deepEqual(photoWarnings(good), []);
  assert.deepEqual(photoWarnings({ ...good, quality: undefined }), []);
  assert.deepEqual(
    photoWarnings({
      width: 400,
      height: 520,
      quality: { sharpness: 8, brightness: 0.1 },
    }),
    ["blurry", "dark", "small"],
  );
  // Unknown sharpness (too little product measured) never says blurry.
  assert.deepEqual(
    photoWarnings({ ...good, quality: { sharpness: -1, brightness: 0.5 } }),
    [],
  );
  assert.ok(PHOTO_LIMITS.minSide === 600);
});

// ------------------------------------- social safe area, adaptive dropping --

test("social 9:16: texts inside the Reels/TikTok safe box, product below", () => {
  const needed = [];
  for (const template of TEMPLATES)
    for (const scene of [null, backdropScene, placedBackdrop, square])
      for (const texts of [full, longest]) {
        const spec = buildSpec({
          ...texts,
          template: template.id,
          scene,
          safeArea: "social",
        });
        const label = `${template.id} ${scene ? scene.uri : "palette"} ${texts === longest ? "longest" : "full"}`;
        assert.deepEqual(safeAreaProblems(spec), [], label);
        assert.deepEqual(clearanceProblems(spec), [], label);
        assert.deepEqual(textOverlapProblems(spec), [], label);
        assert.deepEqual(specProblems(spec), [], label);
        const rest = spec.keys[spec.keys.length - 1];
        assert.ok(rest.scale >= MIN_SOCIAL_PRODUCT - 1e-9, label + " size");
        // Texts on top, the product under them.
        const lowestText = Math.max(...spec.texts.map((t) => t.y));
        assert.ok(rest.y > lowestText, label + " order");
        assert.ok(rest.y + rest.scale / 2 <= 0.95, label + " base");
        if (spec.dropped) needed.push(`${label}: ${spec.dropped.join("+")}`);
      }
  // Only Kampanya (big badge and price) gives up its call to action.
  assert.ok(
    needed.every((n) => n.startsWith("campaign")),
    needed.join("; "),
  );
});

test("social keeps each template's type, sizes and order of appearance", () => {
  for (const template of TEMPLATES) {
    const plain = buildSpec({ ...full, template: template.id });
    const social = buildSpec({
      ...full,
      template: template.id,
      safeArea: "social",
    });
    if (social.dropped) continue;
    assert.equal(social.texts.length, plain.texts.length, template.id);
    social.texts.forEach((t, i) => {
      const p = plain.texts[i];
      assert.equal(t.text, p.text);
      assert.equal(t.font, p.font);
      assert.equal(t.animation, p.animation);
      assert.equal(t.start, p.start);
      assert.ok(t.size <= p.size + 1e-9 && t.size >= p.size * 0.5, template.id);
    });
  }
});

test("social changes nothing outside 9:16", () => {
  for (const template of TEMPLATES)
    for (const ratio of ["4:5", "1:1", "2:3"]) {
      const a = buildSpec({ ...full, template: template.id, ratio });
      const b = buildSpec({
        ...full,
        template: template.id,
        ratio,
        safeArea: "social",
      });
      assert.deepEqual(b, a, template.id + " " + ratio);
    }
  assert.ok(SOCIAL_SAFE.top === 0.14 && SOCIAL_SAFE.bottom === 0.65);
});

test("Kampanya 1:1 with every text keeps a real product", () => {
  for (const scene of [null, backdropScene])
    for (const texts of [full, longest]) {
      const spec = buildSpec({
        ...texts,
        template: "campaign",
        ratio: "1:1",
        scene,
      });
      const label =
        (scene ? "scene" : "palette") + (texts === longest ? " longest" : "");
      const rest = spec.keys[spec.keys.length - 1];
      // Designed: 0.5 x 0.92 (old price) x the 1:1 product factor.
      const designed = scene
        ? sceneForRatio(scene, "1:1").productRect.height
        : 0.5 * 0.92 * layoutForRatio("1:1").product;
      assert.ok(rest.scale >= MIN_PRODUCT_SHARE * designed - 1e-6, label);
      assert.deepEqual(clearanceProblems(spec), [], label);
      // Whatever was dropped really is missing, and nothing else is.
      const dropped = spec.dropped ?? [];
      assert.equal(
        spec.texts.some((t) => t.text === texts.cta),
        !dropped.includes("cta"),
        label,
      );
      assert.equal(
        spec.texts.some((t) => t.text === upperTr(texts.badge)),
        !dropped.includes("badge"),
        label,
      );
      assert.ok(
        spec.texts.some((t) => t.text === texts.price),
        label,
      );
    }
});

test("dropping texts is reported and validated", () => {
  const wordy = {
    ...full,
    headline: "Premium Kablosuz Gürültü Önleyici Kulaklık Siyah",
  };
  const spec = buildSpec({
    ...wordy,
    template: "campaign",
    safeArea: "social",
  });
  assert.deepEqual(spec.dropped, ["cta"]);
  assert.ok(!spec.texts.some((t) => t.text === wordy.cta));
  // Nothing to drop when the call to action was empty anyway.
  const noCta = buildSpec({
    ...full,
    cta: "",
    template: "campaign",
    safeArea: "social",
  });
  assert.equal(noCta.dropped, undefined);
  assert.equal(buildSpec({ ...full, template: "showcase" }).dropped, undefined);
  assert.ok(
    specProblems({ ...spec, dropped: ["headline"] }).includes("dropped"),
  );
});

// ------------------------------------------------------------ QA run 13 --

test("a scene's crop always has the frame's shape (any image, any ratio)", () => {
  const images = [
    [1296, 2304],
    [1024, 1024],
    [4032, 3024],
    [3024, 4032],
    [1000, 3000],
    [3000, 1000],
  ];
  for (const [w, h] of images)
    for (const rect of [
      placedBackdrop.productRect,
      { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
      { x: 0.4, y: 0.7, width: 0.2, height: 0.25 },
    ]) {
      const scene = {
        uri: "file:///tmp/s.jpg",
        crop: sceneCrop(w, h),
        productRect: rect,
      };
      for (const ratio of ALL_RATIOS) {
        const label = `${w}x${h} ${ratio} ${rect.height}`;
        const c = sceneForRatio(scene, ratio).crop;
        const cy = c.y ?? 0,
          ch = c.height ?? 1;
        // Pixel shape of the crop = frame shape, so an aspect fill covers
        // the frame with nothing to spare and nothing missing.
        assert.ok(
          Math.abs((c.width * w) / (ch * h) - 1 / ratioHeight(ratio)) < 1e-6,
          label,
        );
        assert.ok(c.x >= -1e-9 && c.x + c.width <= 1 + 1e-9, label);
        assert.ok(cy >= -1e-9 && cy + ch <= 1 + 1e-9, label);
        // The spec carries exactly that crop.
        const spec = buildSpec({ ...full, scene, ratio });
        assert.equal(spec.background.imageX, c.x, label);
        assert.equal(spec.background.imageWidth, c.width, label);
        assert.equal(spec.background.imageY, cy, label);
        assert.equal(spec.background.imageHeight, ch, label);
      }
    }
});

test("close-ups outside Detay keep the whole product in frame, with air", () => {
  const sizes = [
    { width: 540, height: 1000 },
    { width: 700, height: 1000 },
    { width: 1000, height: 1000 },
    { width: 1600, height: 900 },
    { width: 300, height: 640 },
  ];
  for (const template of TEMPLATES) {
    if (template.id === "detail") continue;
    for (const ratio of ALL_RATIOS)
      for (const scene of [null, placedBackdrop, square])
        for (const safeArea of ["none", "social"])
          for (const productSize of sizes) {
            const spec = buildSpec({
              ...full,
              template: template.id,
              ratio,
              scene,
              safeArea,
              productSize,
            });
            const label = `${template.id} ${ratio} ${scene ? scene.uri : "palette"} ${safeArea} ${productSize.width}x${productSize.height}`;
            assert.deepEqual(closeUpProblems(spec, productSize), [], label);
          }
  }
  assert.ok(CLOSE_UP_MARGIN.vertical >= 0.05 && CLOSE_UP_MARGIN.side >= 0.04);
});

test("the close-up check sees a product pushed off the frame edge", () => {
  const productSize = { width: 540, height: 1000 };
  const spec = buildSpec({ ...full, template: "showcase", productSize });
  const shots = spec.shots.map((s) => (s.zoom > 1 ? { ...s, zoom: 2.2 } : s));
  assert.ok(closeUpProblems({ ...spec, shots }, productSize).length > 0);
});

// ------------------------------------------------------------ round 7 --

test("English texts are upper-cased with English rules", () => {
  const en = {
    ...base,
    template: "minimal",
    headline: "Limited edition",
    badge: "free shipping",
    cta: "visit the store",
    textLang: "en",
  };
  const minimal = buildSpec(en).texts.map((t) => t.text);
  for (const want of ["LIMITED EDITION", "FREE SHIPPING", "VISIT THE STORE"])
    assert.ok(minimal.includes(want), want + " in " + minimal.join(" | "));
  assert.ok(!minimal.some((t) => t.includes("İ")), minimal.join(" | "));
  const store = buildSpec({
    ...base,
    template: "store",
    store: "Nur Studio",
    textLang: "en",
  });
  assert.ok(store.texts.some((t) => t.text === "NUR STUDIO"));
  // Turkish stays the default.
  const tr = buildSpec({ ...base, template: "minimal", badge: "%20 indirim" });
  assert.ok(tr.texts.some((t) => t.text === "%20 İNDİRİM"));
  assert.equal(upperFor("%20 indirim"), "%20 İNDİRİM");
  assert.equal(upperFor("free shipping", "en"), "FREE SHIPPING");
  // A text with Turkish-only letters keeps the Turkish rules.
  assert.equal(upperFor("kargo bedava şimdi", "en"), "KARGO BEDAVA ŞİMDİ");
  // English Minimal headlines keep their line budget (fitted as the headline).
  const long = buildSpec({
    ...en,
    headline: "Handmade lavender soap with shea",
  });
  const trLong = buildSpec({
    ...en,
    headline: long.texts[0].text,
    textLang: "tr",
  });
  const head = long.texts.find((t) => t.text.startsWith("HANDMADE"));
  assert.ok(head && textLines(head) <= 2);
  assert.ok(trLong.texts.length > 0);
});

test("the poster moment shows the whole product with its texts in", () => {
  for (const template of TEMPLATES)
    for (const ratio of ALL_RATIOS)
      for (const scene of [null, placedBackdrop]) {
        const spec = buildSpec({
          ...full,
          template: template.id,
          ratio,
          scene,
        });
        const t = posterTime(spec);
        const label = `${template.id} ${ratio} ${scene ? "scene" : "palette"} ${t}`;
        assert.ok(t >= 0.5 && t <= spec.duration - 0.5 + 1e-9, label);
        assert.ok(Math.abs(t * 30 - Math.round(t * 30)) < 1e-6, label);
        assert.ok(poseAt(spec.keys, t).opacity >= 0.99, label);
        // Not inside a close-up cut.
        const shot = [...spec.shots].reverse().find((s) => s.t <= t + 1e-6);
        assert.ok(!shot || shot.zoom <= 1.0001, label);
        // Every text that stays to the end is fully in.
        for (const text of spec.texts)
          if (text.end >= spec.duration - 0.01)
            assert.ok(t >= text.start + 0.5, label + " " + text.text);
      }
  // Frame 0 is never the poster: the product starts hidden in most templates.
  const hidden = TEMPLATES.filter(
    (tpl) => buildSpec({ ...full, template: tpl.id }).keys[0].opacity < 0.99,
  );
  assert.ok(hidden.length > 0);
});

test("a main image never enlarges the cut-out at its still size", () => {
  const sample = { width: 532, height: 974 };
  for (const width of [1080, 1500, 1800, 2000])
    for (const ratio of ["1:1", "2:3"])
      for (const productSize of [sample, { width: 1600, height: 900 }]) {
        const input = {
          product: "file:///tmp/p.png",
          productSize,
          ratio,
          width,
        };
        const spec = buildMainImageSpec(input);
        const fit = mainImageFit(input);
        const label = `${width} ${ratio} ${productSize.width}`;
        assert.ok(
          stillEnlargement(spec, productSize, width, 0) <= 1 + 1e-9,
          label,
        );
        assert.ok(fit.fill <= fit.requested + 1e-9, label);
        assert.equal(spec.keys[0].scale, fit.scale);
        // Either the requested fill, or exactly the cut-out's own pixels.
        const full = Math.abs(fit.fill - fit.requested) < 1e-9;
        const atPixels =
          Math.abs(stillEnlargement(spec, productSize, width, 0) - 1) < 1e-9;
        assert.ok(full || atPixels, label);
      }
  // The bundled sample at Amazon's 2000 px: 1700 px of product would be needed.
  const amazon = mainImageFit({
    product: "file:///tmp/p.png",
    productSize: sample,
    width: 2000,
  });
  assert.equal(amazon.neededHeight, 1700);
  assert.ok(amazon.fill < 0.5);
  // A large cut-out still gets the full 85%.
  const big = mainImageFit({
    product: "file:///tmp/p.png",
    productSize: { width: 1800, height: 2000 },
    width: 2000,
  });
  assert.ok(Math.abs(big.fill - 0.85) < 1e-9);
});

test("every family has a sample face for the font chips", () => {
  for (const f of FONT_STYLES) {
    assert.ok(FONT_SIZE_FACTOR[f.id] > 0, f.id);
    if (f.id === "system") assert.equal(FONT_SAMPLE_FAMILY[f.id], undefined);
    else
      assert.match(
        FONT_SAMPLE_FAMILY[f.id] ?? "",
        /^[A-Za-z]+-[A-Za-z]+$/,
        f.id,
      );
  }
});

test("no text reaches into a 24 pt rounded corner on the smallest display", () => {
  // Home hero: about 269 pt wide, 24 pt corners = 9% of the frame width.
  const r = 24 / 269;
  for (const template of TEMPLATES)
    for (const ratio of ALL_RATIOS)
      for (const safeArea of ["none", "social"])
        for (const scene of [null, placedBackdrop]) {
          const spec = buildSpec({
            ...longest,
            template: template.id,
            ratio,
            safeArea,
            scene,
          });
          const rh = ratioHeight(ratio); // frame height in frame widths
          for (const t of spec.texts) {
            const w = textWidth(t),
              h = textHeight(t, ratio) * rh,
              y = t.y * rh;
            // Box corners in frame widths (texts are centred), measured
            // against the rounded frame with 0.5% of the width to spare.
            for (const x of [0.5 - w / 2, 0.5 + w / 2])
              for (const yy of [y - h / 2, y + h / 2]) {
                const cx = Math.min(Math.max(x, r), 1 - r),
                  cy = Math.min(Math.max(yy, r), rh - r);
                const label = `${template.id} ${ratio} ${safeArea} ${t.text}`;
                assert.ok(Math.hypot(x - cx, yy - cy) <= r - 0.005, label);
              }
          }
        }
});

// ------------------------------------------- Kampanya (approved Vitrin ad) --

test("Kampanya: texts stay inside the frame (and the social box) for every ratio", () => {
  for (const ratio of RATIOS)
    for (const texts of [full, longest]) {
      const spec = buildSpec({ ...texts, template: "campaign", ratio });
      const label = `${ratio} ${texts === longest ? "longest" : "full"}`;
      assert.deepEqual(specProblems(spec), [], label);
      for (const t of spec.texts) {
        const h = textHeight(t, ratio) / 2;
        assert.ok(t.y - h >= 0.02 && t.y + h <= 0.98, label + " " + t.text);
        assert.ok(textWidth(t) <= 0.9 + 1e-9, label + " width " + t.text);
      }
    }
  for (const texts of [full, longest, { ...full, oldPrice: "" }]) {
    const spec = buildSpec({
      ...texts,
      template: "campaign",
      safeArea: "social",
    });
    assert.deepEqual(safeAreaProblems(spec), [], "social");
    assert.deepEqual(clearanceProblems(spec), [], "social clearance");
  }
});

test("Kampanya: tag, name, price, button enter in that order and stay to the end", () => {
  const spec = buildSpec({ ...full, template: "campaign" });
  const at = (text) => spec.texts.find((t) => t.text === text);
  const tag = at(upperTr(full.badge)),
    name = spec.texts.find((t) => t.text === upperTr(full.headline)),
    price = at(full.price),
    cta = at(full.cta);
  assert.ok(tag && name && price && cta);
  assert.ok(tag.start < name.start && name.start < price.start);
  assert.ok(price.start < cta.start);
  // Small tag, big uppercase name, strongest price.
  assert.ok(tag.size < 0.05 && name.size > tag.size * 1.8);
  assert.ok(price.size > name.size && price.fill !== "");
  for (const t of spec.texts)
    assert.equal(t.end, spec.duration, t.text + " stays");
  // Calm end card: everything is on screen for at least 1.5 s before the end.
  assert.ok(spec.duration - cta.start >= 1.5);
  assert.equal(spec.duration, 9);
});

test("Kampanya: the product rests big enough and the button survives short copy", () => {
  // Trade-off: the name and price blocks take room; 0.30 is the floor in the
  // three ratios, MIN_SOCIAL_PRODUCT in the social layout.
  for (const ratio of RATIOS) {
    const spec = buildSpec({ ...full, template: "campaign", ratio });
    assert.ok(spec.keys.at(-1).scale >= 0.3, ratio);
  }
  const copy = {
    ...full,
    headline: "Gül Amber Parfüm",
    cta: "Hemen Sipariş Ver",
  };
  for (const texts of [copy, { ...copy, oldPrice: "" }]) {
    const spec = buildSpec({
      ...texts,
      template: "campaign",
      safeArea: "social",
    });
    assert.ok(spec.keys.at(-1).scale >= MIN_SOCIAL_PRODUCT, "social product");
    assert.equal(spec.dropped, undefined, "social keeps the button");
    assert.ok(
      spec.texts.some((t) => t.text === texts.cta),
      "button present",
    );
  }
});

test("Kampanya: the product moves from its first frame and ends calm", () => {
  for (const ratio of RATIOS) {
    const spec = buildSpec({ ...full, template: "campaign", ratio });
    const [first, second] = spec.keys;
    const rest = spec.keys[spec.keys.length - 1];
    assert.ok(first.y - rest.y > 0.3, ratio + " enters from below");
    assert.notEqual(first.ease, undefined);
    assert.equal(second.ease, "back", "eased arrival");
    // Moving at t = 0.1 already (no static start).
    assert.notEqual(poseAt(spec.keys, 0.1).y, first.y, ratio);
    // The last 1.5 s do not move.
    const a = poseAt(spec.keys, spec.duration - 1.5),
      b = poseAt(spec.keys, spec.duration);
    assert.ok(Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.scale - b.scale) < 1e-9);
    assert.ok(Math.abs(a.yaw - b.yaw) < 1e-9, ratio + " yaw");
  }
  const spec = buildSpec({ ...full, template: "campaign" });
  assert.ok(
    spec.keys.some((k) => k.yaw < -5) && spec.keys.some((k) => k.yaw > 5),
  );
  assert.equal(spec.sweeps.length, 1);
});

test("Kampanya: without chosen colours it uses the approved scheme", () => {
  const spec = buildSpec({
    ...full,
    palette: "blush",
    template: "campaign",
    colors: null,
  });
  const ink = "#141210",
    accent = "#FF7A00";
  const tag = spec.texts.find((t) => t.text === upperTr(full.badge)),
    name = spec.texts.find((t) => t.text === upperTr(full.headline)),
    price = spec.texts.find((t) => t.text === full.price),
    cta = spec.texts.find((t) => t.text === full.cta);
  // Label: ink chip, accent type.
  assert.equal(tag.fill, ink);
  assert.equal(tag.color, accent);
  // Name: ink type, no shape.
  assert.equal(name.color, ink);
  assert.equal(name.fill, "");
  // Price: accent shape, ink type.
  assert.equal(price.fill, accent);
  assert.equal(price.color, ink);
  // Button: ink pill, accent type.
  assert.equal(cta.fill, ink);
  assert.equal(cta.color, accent);
});

test("Kampanya: chosen colours replace the approved scheme", () => {
  const colors = {
    ink: "#1E1B18",
    accent: "#1E1B18",
    onAccent: "#F6F2EA",
    sparkle: "#FFFFFF",
  };
  const spec = buildSpec({ ...full, template: "campaign", colors });
  const price = spec.texts.find((t) => t.text === full.price),
    cta = spec.texts.find((t) => t.text === full.cta);
  assert.equal(price.fill, "#1E1B18");
  assert.equal(price.color, "#F6F2EA");
  // Accent equals the ink here, so the pill keeps readable onAccent type.
  assert.equal(cta.fill, "#1E1B18");
  assert.equal(cta.color, "#F6F2EA");
  // Other templates ignore the Kampanya scheme.
  const other = buildSpec({ ...full, template: "editorial", colors: null });
  assert.ok(!other.texts.some((t) => t.fill === "#FF7A00"));
});

// ----------------------------- Single-flow templates (Kampanya/İndirim/Vitrin)

const SINGLE_FLOW_TEMPLATES = ["campaign", "discount", "showcase"];

test("single-flow templates: texts stay inside the frame and the social box", () => {
  const variants = [
    full,
    longest,
    { ...full, oldPrice: "" },
    { ...full, badge: "" },
    { ...full, cta: "" },
    { ...full, oldPrice: "", badge: "", cta: "" },
  ];
  for (const template of SINGLE_FLOW_TEMPLATES)
    for (const texts of variants) {
      for (const ratio of RATIOS) {
        const spec = buildSpec({ ...texts, template, ratio });
        const label = `${template} ${ratio}`;
        assert.deepEqual(specProblems(spec), [], label);
        for (const t of spec.texts) {
          const h = textHeight(t, ratio) / 2;
          assert.ok(t.y - h >= 0.02 && t.y + h <= 0.98, label + " " + t.text);
          assert.ok(textWidth(t) <= 0.9 + 1e-9, label + " width " + t.text);
        }
      }
      const social = buildSpec({ ...texts, template, safeArea: "social" });
      assert.deepEqual(safeAreaProblems(social), [], template + " social");
    }
});

test("single-flow templates: the approved scheme applies until colours are chosen", () => {
  const ink = "#141210",
    accent = "#FF7A00";
  for (const template of ["discount", "showcase"]) {
    const spec = buildSpec({
      ...full,
      palette: "blush",
      template,
      colors: null,
    });
    for (const t of spec.texts)
      if (t.fill === accent)
        assert.equal(t.color, ink, template + " on accent");
    const price = spec.texts.find((t) => t.text === full.price);
    assert.equal(price.color, ink, template + " price");
    const cta = spec.texts.find((t) => t.text === full.cta);
    assert.equal(cta.fill, accent, template + " button");
    assert.equal(cta.color, ink, template + " button type");
  }
});

test("single-flow templates: a dark palette keeps its own readable colours", () => {
  for (const template of SINGLE_FLOW_TEMPLATES) {
    const spec = buildSpec({
      ...full,
      template,
      palette: "noir",
      colors: null,
    });
    const noir = PALETTES.find((p) => p.id === "noir");
    assert.ok(
      !spec.texts.some((t) => t.color === "#141210"),
      template + " ink",
    );
    assert.ok(
      !spec.texts.some((t) => t.fill === "#FF7A00"),
      template + " accent",
    );
    const price = spec.texts.find((t) => t.text === full.price);
    assert.ok(
      [noir.ink, noir.accent, noir.onAccent].includes(price.color),
      template + " price",
    );
  }
});

test("whole-photo cut-out: flagged, not flagged, missing size", () => {
  // 4000x3000 photo is scaled to 2048x1536 before the crop.
  const photo = { width: 4000, height: 3000 };
  assert.equal(isWholePhotoCutout({ width: 2048, height: 1536 }, photo), true);
  assert.equal(isWholePhotoCutout({ width: 1900, height: 1420 }, photo), true);
  // Product only: narrow in one direction is enough to pass.
  assert.equal(isWholePhotoCutout({ width: 1200, height: 1536 }, photo), false);
  assert.equal(isWholePhotoCutout({ width: 2048, height: 900 }, photo), false);
  // A small photo is not scaled up.
  assert.equal(
    isWholePhotoCutout(
      { width: 600, height: 400 },
      { width: 640, height: 430 },
    ),
    true,
  );
  assert.equal(isWholePhotoCutout({ width: 2048, height: 1536 }, null), false);
  assert.equal(
    isWholePhotoCutout({ width: 2048, height: 1536 }, undefined),
    false,
  );
  assert.equal(
    isWholePhotoCutout({ width: 10, height: 10 }, { width: 0, height: 0 }),
    false,
  );
});

test("fallback error text per context, never raw system text", () => {
  assert.deepEqual(fallbackErrorText("cutout"), {
    tr: "Ürün ayrılamadı. Tekrar dene.",
    en: "The product could not be cut out. Try again.",
  });
  assert.deepEqual(fallbackErrorText("still"), {
    tr: "Görsel hazırlanamadı. Tekrar dene.",
    en: "The image could not be prepared. Try again.",
  });
  assert.equal(
    fallbackErrorText("video").tr,
    "Video hazırlanamadı. Tekrar dene.",
  );
  for (const context of ["video", "cutout", "still"]) {
    const { tr, en } = fallbackErrorText(context);
    assert.ok(!tr.includes("(") && !en.includes("("), context);
  }
});
