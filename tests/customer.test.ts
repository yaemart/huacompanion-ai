import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerEmail,
  customerHash,
  customerTokenMatches,
  usableChallenge,
  usableCustomerSession,
  validCustomerToken,
} from "../src/lib/customer.ts";
test("customer verification normalizes email and rejects invalid input", () => {
  assert.equal(customerEmail(" Test@Example.com "), "test@example.com");
  for (const v of [null, "hello", "@example.com", "a @x.com", "a@x@x.com"])
    assert.throws(() => customerEmail(v));
});
test("verification secrets are hashed and constant-length tokens required", () => {
  const token = "a".repeat(64);
  const hash = customerHash(token);
  assert.notEqual(hash, token);
  assert.equal(customerTokenMatches(token, hash), true);
  assert.equal(customerTokenMatches("b".repeat(64), hash), false);
  assert.equal(customerTokenMatches("", hash), false);
  assert.equal(validCustomerToken("A".repeat(64)), false);
});
test("verification rejects expiry, replay and exhausted attempts", () => {
  const now = Date.now();
  const c = { attempts: 0, expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(usableChallenge(c, now), true);
  assert.equal(usableChallenge({ ...c, attempts: 5 }, now), false);
  assert.equal(usableChallenge({ ...c, consumedAt: new Date().toISOString() }, now), false);
  assert.equal(usableChallenge(c, now + 1000), false);
  assert.equal(usableChallenge(null, now), false);
});

test("sessions fail closed on expired, revoked or malformed expiry", () => {
  const now = Date.now();
  const session = { expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(usableCustomerSession(session, now), true);
  for (const s of [
    null,
    { expiresAt: null },
    { expiresAt: "invalid" },
    { ...session, revokedAt: new Date().toISOString() },
  ])
    assert.equal(usableCustomerSession(s, now), false);
  assert.equal(usableCustomerSession(session, now + 1000), false);
});
