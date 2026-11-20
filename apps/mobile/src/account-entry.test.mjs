// Run with: node --test apps/mobile/src/*.test.mjs
// Source-level pins for the two entry points of the optional account
// (docs/giris/plan.md "Paket 3"): the Settings "Hesap" row and the Library
// welcome line. With FEATURES.accounts off both screens must look as before.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COPY } from "./auth/copy.ts";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(mobile, rel), "utf8");
const settings = read("app/(tabs)/(settings)/settings.tsx");
const library = read("app/(tabs)/(library)/library.tsx");

const OLD_TR = "Vidora hesap açtırmaz ve seni takip etmez.";
const OLD_EN = "Vidora has no account and does not track you.";

function tsx(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsx(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("Settings: the account row exists once, in a section behind FEATURES.accounts, before the subscription", () => {
  assert.equal(settings.match(/testID="settings-account"/g)?.length, 1);
  // The row lives in AccountSection, which is mounted in one place only.
  assert.equal(settings.match(/<AccountSection\b/g)?.length, 1);
  const mount = /\{FEATURES\.accounts \? <AccountSection \/> : null\}/.exec(settings);
  assert.ok(mount, "AccountSection must be mounted as {FEATURES.accounts ? <AccountSection /> : null}");
  assert.ok(
    mount.index < settings.indexOf('t("Abonelik", "Subscription")'),
    "the account section comes before the subscription section",
  );
  const body = settings.slice(settings.indexOf("function AccountSection"), settings.indexOf("export default function Settings"));
  assert.match(body, /testID="settings-account"/);
  assert.match(body, /router\.push\("\/account"\)/);
  assert.doesNotMatch(body, /from/, "from Settings no from=welcome param");
  assert.match(body, /session\.status === "signedIn" \? session\.email : COPY\.notSignedIn\[lang\]/);
  assert.match(body, /ellipsizeMode="middle"/);
  assert.match(body, /accessibilityLabel=\{COPY\.settingsRow\[lang\] \+ ", " \+ value\}/);
});

test("Settings: flag off keeps the old privacy sentence; flag on swaps only that sentence", () => {
  // The old literal is still in the file, untouched.
  assert.ok(settings.includes(OLD_TR));
  assert.ok(settings.includes(OLD_EN));
  assert.match(settings, /const basePrivacyText = FEATURES\.aiStudio/);
  assert.match(settings, /: basePrivacyText;/);
  assert.match(settings, /FEATURES\.accounts\s*\?\s*basePrivacyText\.replace\(/);

  // Replay the replacement on the real strings.
  const quoted = (needle) => new RegExp(`"([^"\\n]*${needle}[^"\\n]*)"`).exec(settings)?.[1];
  const baseTr = quoted("Vidora hesap açtırmaz");
  const baseEn = quoted("Vidora has no account");
  assert.ok(baseTr && baseEn);
  const newTr = quoted("Google Firebase Authentication'a gönderilir");
  const newEn = quoted("sent to Google Firebase Authentication");
  assert.ok(newTr && newEn);
  for (const [base, oldS, next] of [
    [baseTr, OLD_TR, newTr],
    [baseEn, OLD_EN, newEn],
  ]) {
    const on = base.replace(oldS, next);
    assert.ok(on.includes(next));
    assert.ok(!on.includes(oldS));
    // Everything else in the paragraph stays.
    assert.equal(on.replace(next, oldS), base);
  }
  assert.match(newTr, /isteğe bağlı/);
  assert.match(newTr, /e-posta adresin/);
  assert.match(newEn, /optional/);
  assert.match(newEn, /email address/);
});

test("Library: the welcome line shows only when every condition holds", () => {
  const m = /const showWelcome =([\s\S]*?);/.exec(library);
  assert.ok(m, "showWelcome");
  const show = new Function(
    "FEATURES",
    "loaded",
    "welcome",
    "session",
    "exports",
    `return (${m[1]});`,
  );
  const ok = {
    FEATURES: { accounts: true },
    loaded: true,
    welcome: { ready: true, dismissed: false },
    session: { status: "signedOut" },
    exports: [{}],
  };
  const run = (o) => show(o.FEATURES, o.loaded, o.welcome, o.session, o.exports);
  assert.equal(run(ok), true);
  assert.equal(run({ ...ok, FEATURES: { accounts: false } }), false);
  assert.equal(run({ ...ok, loaded: false }), false);
  assert.equal(run({ ...ok, welcome: { ready: false, dismissed: false } }), false);
  assert.equal(run({ ...ok, welcome: { ready: true, dismissed: true } }), false);
  assert.equal(run({ ...ok, session: { status: "loading" } }), false);
  assert.equal(run({ ...ok, session: { status: "signedIn", uid: "u", email: "a@b.co", offline: false } }), false);
  assert.equal(run({ ...ok, exports: [] }), false);
});

test("Library: welcome line wiring, ids and the only way in", () => {
  for (const id of ["account-welcome", "account-welcome-open", "account-welcome-dismiss"])
    assert.equal(library.match(new RegExp(`testID="${id}"`, "g"))?.length, 1, id);
  assert.match(library, /\{showWelcome \? \(\s*<AccountWelcome/);
  assert.match(library, /pathname: "\/account",\s*params: \{ from: "welcome" \}/);
  assert.match(library, /onDismiss=\{\(\) => \{[\s\S]{0,200}?void dismissWelcome\(\);\s*\}\}/);
  // Nothing of it anywhere else: not on Studio, not in another screen.
  const mentions = tsx(path.join(mobile, "app"))
    .filter((f) => /account-welcome|AccountWelcome/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(mobile, f).split(path.sep).join("/"));
  assert.deepEqual(mentions, ["app/(tabs)/(library)/library.tsx"]);
});

test("copy of the two entry points (TR and EN)", () => {
  assert.equal(COPY.notSignedIn.tr, "Giriş yapılmadı");
  assert.equal(COPY.notSignedIn.en, "Not signed in");
  assert.equal(COPY.settingsSection.tr, "Hesap");
  assert.equal(COPY.settingsSection.en, "Account");
  assert.equal(COPY.welcomeOpen.tr, "Hesap aç, isteğe bağlı");
  assert.equal(COPY.welcomeDismiss.tr, "Kapat");
  assert.ok(COPY.welcomeOpen.en.trim() && COPY.welcomeDismiss.en.trim());
});
