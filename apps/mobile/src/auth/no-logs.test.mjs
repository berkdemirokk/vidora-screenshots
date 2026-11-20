// Run with: node --test apps/mobile/src/auth/*.test.mjs
// Scans the auth sources: nothing may log, and no diagnostic call may receive
// a password, token or secret variable.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const dir = new URL("./", import.meta.url);
const SECRET = /pass(word|wd)?|token|secret|refresh|credential|idtoken|\bpw\b|\bpwd\b|\bpin\b/i;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Text between the parentheses of every call to `name(`; handles nesting. */
function callArgs(src, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
  while (re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}

/** Returns a list of problems found in a source text. */
export function scan(src) {
  const code = stripComments(src);
  const problems = [];
  if (/\bconsole\s*\./.test(code)) problems.push("console.* call");
  if (/\bconsole\s*\[/.test(code)) problems.push("console[...] access");
  if (/from\s+["'][^"']*\bdiag(\.ts)?["']/.test(code)) problems.push("imports diag");
  for (const args of [...callArgs(code, "diag"), ...callArgs(code, "log"), ...callArgs(code, "warn")])
    if (SECRET.test(args)) problems.push(`log/diag call with secret-looking argument: ${args.trim()}`);
  return problems;
}

const sources = readdirSync(dir)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => [f, readFileSync(new URL(f, dir), "utf8")]);

test("the scanner sees every auth source", () => {
  const names = sources.map(([f]) => f);
  for (const f of ["config.ts", "firebase-rest.ts", "session.ts", "copy.ts", "apple.ts", "apple-native.ts", "apple-revoke.ts"]) assert.ok(names.includes(f), f);
});

test("no auth source logs anything or can hand a secret to a diagnostic", () => {
  for (const [file, src] of sources) assert.deepEqual(scan(src), [], file);
});

test("the scanner itself catches the bad patterns", () => {
  assert.ok(scan('console.log("x")').length);
  assert.ok(scan("console.warn(e)").length);
  assert.ok(scan("console.error(password)").length);
  assert.ok(scan('import { diag } from "../diag";').length);
  assert.ok(scan('diag("signin failed", { password })').length);
  assert.ok(scan("diag(`t ${idToken}`)").length);
  assert.ok(scan("diag(foo(refreshToken))").length);
  assert.ok(scan("log(token)").length);
  assert.deepEqual(scan('// console.log(password)\nconst a = 1; /* diag(token) */'), []);
  assert.deepEqual(scan('diag("started")'), []);
});

test("auth sources never write a password or token to storage or URLs by name", () => {
  // The only value allowed into store.set is the session record (refresh token) and "1" flags.
  for (const [file, src] of sources) {
    const code = stripComments(src);
    for (const args of callArgs(code, "store\\.set")) {
      assert.ok(
        /SECURE_KEYS\.session,\s*JSON\.stringify\(\{ refreshToken, uid: identity!\.uid, email: identity!\.email, provider: identity!\.provider, \}\)|SECURE_KEYS\.pendingDelete,\s*"1"|SECURE_KEYS\.appleRevoke,\s*apple$/.test(
          args.replace(/\s+/g, " "),
        ),
        `${file}: unexpected store.set(${args})`,
      );
    }
    assert.doesNotMatch(code, /\?key=\$\{[^}]*(pass|token|email)/i, file);
  }
});

test("Apple sign-in sources never log a token, nonce or authorization code", () => {
  for (const f of ["apple.ts", "apple-native.ts", "apple-revoke.ts"]) {
    const src = sources.find(([n]) => n === f)[1];
    assert.deepEqual(scan(src), [], f);
    const code = stripComments(src);
    assert.doesNotMatch(code, /(diag|log|warn|error|info|debug)\s*\(/, f);
    // The nonce, token and code never end up in a URL.
    assert.doesNotMatch(code, /\?[^"'`]*\$\{[^}]*(nonce|token|code)/i, f);
  }
});
