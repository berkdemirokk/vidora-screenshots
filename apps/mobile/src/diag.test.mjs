// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { clean, diag } from "./diag.ts";

test("diagnostics keep file names but never full paths", () => {
  assert.equal(
    clean(
      "Could not read file:///var/mobile/Containers/Data/Application/ABC/Documents/KareviaMedia/x.m4a now",
    ),
    "Could not read …/x.m4a now",
  );
  assert.equal(
    clean("/private/var/tmp/vidora-still-1.jpg"),
    "…/vidora-still-1.jpg",
  );
  assert.deepEqual(
    clean({ backdrop: "oak", error: new Error("at /a/b/c.png") }),
    { backdrop: "oak", error: "at …/c.png" },
  );
  assert.equal(clean(42), 42);
});

test("diag writes one line with the [vidora] prefix", () => {
  const seen = [];
  const original = { warn: console.warn, error: console.error };
  console.warn = (...args) => seen.push(args);
  console.error = (...args) => seen.push(args);
  try {
    diag("poster failed", {
      key: "showcase-ivory",
      reason: "/x/y/z.jpg missing",
    });
  } finally {
    console.warn = original.warn;
    console.error = original.error;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], "[vidora] poster failed");
  assert.deepEqual(seen[0][1], {
    key: "showcase-ivory",
    reason: "…/z.jpg missing",
  });
});
