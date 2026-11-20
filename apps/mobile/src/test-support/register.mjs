// Load with `await import("./test-support/register.mjs")` BEFORE importing
// draft-store.ts or media.ts dynamically: expo modules resolve to the
// in-memory stand-ins here, and extension-less relative imports to `.ts`.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const stub = (name) => pathToFileURL(path.join(here, name)).href;
const STUBS = {
  "expo-file-system": stub("expo-file-system.mjs"),
  "expo-crypto": stub("expo-crypto.mjs"),
  expo: stub("expo.mjs"),
  "expo-document-picker": stub("empty.mjs"),
  "expo-image-picker": stub("empty.mjs"),
  "expo-media-library": stub("empty.mjs"),
  "expo-media-library/legacy": stub("empty.mjs"),
  "expo-sharing": stub("empty.mjs"),
};
let registered = globalThis.__vidoraFakeFs;
if (!registered) {
  globalThis.__vidoraFakeFs = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (STUBS[specifier])
        return { url: STUBS[specifier], shortCircuit: true };
      if (
        specifier.startsWith(".") &&
        context.parentURL &&
        !/\.(ts|tsx|mjs|js|json)$/.test(specifier)
      ) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        for (const ext of [".ts", ".tsx"])
          if (existsSync(base + ext))
            return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
      return next(specifier, context);
    },
  });
}
export { fs } from "./expo-file-system.mjs";
