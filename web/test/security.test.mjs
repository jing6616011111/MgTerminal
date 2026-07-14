import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, decryptJson, encryptJson, hashPassword, parseCookies, verifyPassword, verifySessionToken } from "../server/security.mjs";

test("password hashes verify without storing plaintext", () => {
  const encoded = hashPassword("a-very-long-test-password");
  assert.match(encoded, /^scrypt\$/);
  assert.equal(encoded.includes("a-very-long-test-password"), false);
  assert.equal(verifyPassword("a-very-long-test-password", encoded), true);
  assert.equal(verifyPassword("wrong-password", encoded), false);
});

test("session tokens are signed and expire-aware", () => {
  const secret = "s".repeat(40);
  const token = createSessionToken(secret, 60);
  assert.equal(verifySessionToken(token, secret), true);
  assert.equal(verifySessionToken(`${token}x`, secret), false);
  assert.equal(verifySessionToken(token, "x".repeat(40)), false);
});

test("host credentials are authenticated-encrypted", () => {
  const secret = "secret-material".repeat(4);
  const encrypted = encryptJson({ password: "top-secret", privateKey: "key" }, secret);
  assert.equal(encrypted.includes("top-secret"), false);
  assert.deepEqual(decryptJson(encrypted, secret), { password: "top-secret", privateKey: "key" });
  assert.throws(() => decryptJson(encrypted, "different-secret"));
});


test("malformed cookies cannot crash authentication", () => {
  assert.deepEqual(parseCookies("valid=one; broken=%E0%A4%A"), { valid: "one", broken: "%E0%A4%A" });
});
