// Run with: node --test apps/mobile/src/auth/*.test.mjs  (offline: everything is injected)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { AuthError } from "./firebase-rest.ts";
import { runAppleSignIn } from "./apple.ts";
import { createAppleRevoke } from "./apple-revoke.ts";

const sha = async (v) => createHash("sha256").update(v).digest("hex");

function deps(signIn, nonce = "rawnonce0123") {
  return { randomNonce: () => nonce, sha256: sha, signIn };
}

test("apple: Apple gets the SHA-256 of the nonce, the caller gets the raw one", async () => {
  let sent;
  const r = await runAppleSignIn(
    deps(async (o) => ((sent = o), { identityToken: "id.tok", authorizationCode: "c1" })),
  );
  assert.equal(sent.nonce, await sha("rawnonce0123"));
  assert.notEqual(sent.nonce, "rawnonce0123");
  assert.deepEqual(r, { identityToken: "id.tok", rawNonce: "rawnonce0123", authorizationCode: "c1" });
});

test("apple: a missing authorization code is null, a missing identity token fails", async () => {
  const r = await runAppleSignIn(deps(async () => ({ identityToken: "t", authorizationCode: null })));
  assert.equal(r.authorizationCode, null);
  for (const bad of [{}, { identityToken: null }, { identityToken: "" }])
    await assert.rejects(
      runAppleSignIn(deps(async () => bad)),
      (e) => e instanceof AuthError && e.code === "appleFailed",
    );
});

test("apple: ERR_REQUEST_CANCELED is a silent null, every other error is appleFailed", async () => {
  const canceled = Object.assign(new Error("x"), { code: "ERR_REQUEST_CANCELED" });
  assert.equal(
    await runAppleSignIn(
      deps(async () => {
        throw canceled;
      }),
    ),
    null,
  );
  await assert.rejects(
    runAppleSignIn(
      deps(async () => {
        throw Object.assign(new Error("tok-secret"), { code: "ERR_REQUEST_FAILED" });
      }),
    ),
    (e) => e instanceof AuthError && e.code === "appleFailed" && !JSON.stringify(e).includes("secret"),
  );
});

test("apple revoke client: empty or non-https URL means no client", () => {
  assert.equal(createAppleRevoke(""), null);
  assert.equal(createAppleRevoke("http://x.dev"), null);
  assert.ok(createAppleRevoke("https://w.example.workers.dev/"));
});

test("apple revoke client: exchange and revoke call the worker and never throw", async () => {
  const calls = [];
  const reply = (body, ok = true) => async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    return { ok, json: async () => body };
  };
  const c = createAppleRevoke("https://w.example.workers.dev/", reply({ refresh_token: "art" }));
  assert.equal(await c.exchange("code1"), "art");
  assert.equal(await c.revoke("art"), true);
  assert.deepEqual(calls, [
    ["https://w.example.workers.dev/exchange", { authorizationCode: "code1" }],
    ["https://w.example.workers.dev/revoke", { refresh_token: "art" }],
  ]);
  const down = createAppleRevoke("https://w.example.workers.dev", async () => {
    throw new Error("offline");
  });
  assert.equal(await down.exchange("c"), null);
  assert.equal(await down.revoke("t"), false);
  const bad = createAppleRevoke("https://w.example.workers.dev", reply({}, false));
  assert.equal(await bad.exchange("c"), null);
  assert.equal(await bad.revoke("t"), false);
  const odd = createAppleRevoke("https://w.example.workers.dev", reply({ refresh_token: 5 }));
  assert.equal(await odd.exchange("c"), null);
});
