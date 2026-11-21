import assert from "node:assert/strict";
import test from "node:test";
import { buildSpec, specProblems, MAX_SCENES } from "./product-templates.ts";

const base = {
  template: "campaign",
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

const scene = (start, over = {}) => ({
  start,
  image: "file:///tmp/s" + start + ".png",
  mode: "photo",
  keys: [],
  transition: { kind: "cut", duration: 0 },
  ...over,
});

const withScenes = (scenes, duration = 9) => ({
  ...buildSpec(base),
  duration,
  scenes,
});

test("spec without scenes passes unchanged", () => {
  const spec = buildSpec(base);
  assert.equal("scenes" in spec, false);
  assert.deepEqual(specProblems(spec), []);
});

test("valid scenes pass", () => {
  assert.deepEqual(specProblems(withScenes([scene(0), scene(4)])), []);
});

test("scenes must start at 0 and increase", () => {
  const p = specProblems(withScenes([scene(0), scene(2), scene(1.5)]));
  assert.ok(p.some((x) => x.includes("scenes")), p.join());
  const q = specProblems(withScenes([scene(1), scene(3)]));
  assert.ok(q.some((x) => x.includes("scenes")), q.join());
});

test("more than 8 scenes is a problem", () => {
  const many = Array.from({ length: MAX_SCENES + 1 }, (_, i) => scene(i));
  assert.ok(specProblems(withScenes(many)).length > 0);
});

test("missing scene image is a spec problem", () => {
  const p = specProblems(withScenes([scene(0), scene(3, { image: "" })]));
  assert.ok(p.some((x) => x.includes("image")), p.join());
});

test("scene start past duration is a problem", () => {
  const p = specProblems(withScenes([scene(0), scene(9.2)], 9));
  assert.ok(p.some((x) => x.includes("scenes")), p.join());
});

test("transition longer than 1.5 s is a problem", () => {
  const long = { kind: "push", duration: 1.6 };
  const neg = { kind: "push", duration: -0.1 };
  for (const transition of [long, neg])
    assert.ok(
      specProblems(withScenes([scene(0), scene(3, { transition })])).length > 0,
    );
  assert.deepEqual(
    specProblems(
      withScenes([scene(0), scene(3, { transition: { kind: "wipe", duration: 1.5 } })]),
    ),
    [],
  );
});

test("invalid scene mode, keys and shade are problems", () => {
  const cases = [
    ["mode", { mode: "x" }],
    ["keys", { keys: null }],
    ["shade", { shade: 1.2 }],
    ["shade", { shade: -0.1 }],
  ];
  for (const [word, over] of cases) {
    const p = specProblems(withScenes([scene(0), scene(3, over)]));
    assert.ok(p.some((x) => x.includes(word)), word + ": " + p.join());
  }
});

test("depth mode is a valid scene mode", () => {
  const depthKeys = [
    { t: 0, x: -0.6, y: 0, scale: 1, rotation: 0, opacity: 1, yaw: 0, ease: "inOut" },
    { t: 3, x: 0.6, y: 0.2, scale: 1.3, rotation: 0, opacity: 1, yaw: 0, ease: "inOut" },
  ];
  const spec = withScenes([scene(0), scene(3, { mode: "depth", keys: depthKeys })]);
  assert.deepEqual(specProblems(spec), []);
  const p = specProblems(withScenes([scene(0), scene(3, { mode: "depths" })]));
  assert.ok(p.some((x) => x.includes("mode")), p.join());
});

test("16 scenes with 16 photos pass, 17 do not", () => {
  assert.equal(MAX_SCENES, 16);
  const sixteen = Array.from({ length: 16 }, (_, i) => scene(i * 0.75));
  assert.deepEqual(specProblems(withScenes(sixteen, 13)), []);
  const seventeen = Array.from({ length: 17 }, (_, i) => scene(i * 0.75));
  const p = specProblems(withScenes(seventeen, 13));
  assert.ok(p.includes("scenes count"), p.join());
});

test("blur and flash are valid transitions, others are not", () => {
  for (const transition of [
    { kind: "blur", duration: 0.25 },
    { kind: "flash", duration: 0 },
  ])
    assert.deepEqual(specProblems(withScenes([scene(0), scene(3, { transition })])), []);
  const p = specProblems(
    withScenes([scene(0), scene(3, { transition: { kind: "spin", duration: 0.3 } })]),
  );
  assert.ok(p.some((x) => x.includes("transition")), p.join());
});

test("grade values must be finite and within -1...1", () => {
  const grade = { warmth: 0.4, saturation: -0.2, contrast: 0.1, fade: 0.3 };
  assert.deepEqual(specProblems({ ...withScenes([scene(0)]), grade }), []);
  assert.deepEqual(
    specProblems({ ...withScenes([scene(0)]), grade: { warmth: -1, saturation: 1, contrast: 0, fade: 0 } }),
    [],
  );
  for (const bad of [
    { ...grade, warmth: 1.1 },
    { ...grade, saturation: -1.01 },
    { ...grade, contrast: Number.NaN },
    { ...grade, fade: undefined },
    null,
  ]) {
    const p = specProblems({ ...withScenes([scene(0)]), grade: bad });
    assert.ok(p.includes("grade"), JSON.stringify(bad) + ": " + p.join());
  }
});
