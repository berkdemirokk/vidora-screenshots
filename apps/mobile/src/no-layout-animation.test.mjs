// Run with: node --test apps/mobile/src/*.test.mjs
// Guard: no React Native LayoutAnimation anywhere in the app (QA run 22).
//
// Why: on Fabric (new architecture) LayoutAnimation does not animate on the
// UI thread; ReactCommon/react/renderer/animations/
// LayoutAnimationKeyFrameManager.cpp intercepts the next commit(s), DELAYS
// the Remove/Delete mutations of every removed view until the animation has
// run, and replays Update mutations from a run-loop tick (UIManager::
// animationTick) while later commits keep arriving. A tick (or a conflict
// resolution) can then hand the mounting layer a mutation for a tag that is
// no longer registered, and -[RCTComponentViewRegistry
// componentViewDescriptorWithTag:] traps (run 22: SIGTRAP on the main thread
// one second after "Videoyu oluştur"). Without configureNext nothing is ever
// delayed: shouldOverridePullTransaction() is false and every commit goes
// straight to the mounting layer.
//
// Rule: layout changes apply at once. Opacity fades stay on Animated.Value.
// Do not replace this with another layout-animation mechanism either.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const self = fileURLToPath(import.meta.url);

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

// Every spelling of the API: the module, configureNext, the Android opt-in,
// the UIManager bridge method, Reanimated's layout transitions.
const FORBIDDEN =
  /LayoutAnimation|KeyboardAvoidingView|scheduleLayoutAnimation|configureNext|setLayoutAnimationEnabledExperimental|LayoutTransition|react-native-reanimated/i;

test("the pattern catches every spelling it is meant to", () => {
  for (const sample of [
    `import { LayoutAnimation } from "react-native";`,
    `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);`,
    `LayoutAnimation.create(200, "easeOut", "opacity")`,
    `UIManager.setLayoutAnimationEnabledExperimental?.(true)`,
    `UIManager.configureNextLayoutAnimation(config, done, fail)`,
    `import { LinearTransition } from "react-native-reanimated";`,
    `const t = LayoutTransition.duration(200);`,
    `<KeyboardAvoidingView behavior="padding" />`,
    `scheduleLayoutAnimation(event)`,
  ])
    assert.match(sample, FORBIDDEN, sample);
  for (const fine of [
    `new Animated.Value(0)`,
    `Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true })`,
    `const panelHeight = 120;`,
  ])
    assert.doesNotMatch(fine, FORBIDDEN, fine);
});

test("no LayoutAnimation in apps/mobile/app or apps/mobile/src", () => {
  const files = [
    ...sources(path.join(mobile, "app")),
    ...sources(path.join(mobile, "src")),
  ].filter((file) => file !== self);
  assert.ok(files.length > 50, "the scan found the sources");
  const found = [];
  for (const file of files) {
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (FORBIDDEN.test(line))
          found.push(
            `${path.relative(mobile, file).split(path.sep).join("/")}:${index + 1}`,
          );
      });
  }
  assert.deepEqual(
    found,
    [],
    "Fabric LayoutAnimation delays Remove/Delete mutations and can crash the " +
      "mounting layer (run 22). Apply layout changes at once; fade with " +
      "Animated.Value. Found: " +
      found.join(", "),
  );
});
