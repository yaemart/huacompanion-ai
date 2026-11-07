import test from "node:test";
import assert from "node:assert/strict";
import { intakeClient, IntakeClientError, hasIntakeHoneypot } from "../src/server/intake-client.ts";

const env = {
  PAYLOAD_SECRET: "unit-test-secret-with-at-least-32-characters",
  APP_URL: "https://hua.test",
};
const proxySecret = "gateway-only-secret-with-at-least-32-characters";
const request = (headers: Record<string, string> = {}) =>
  new Request("https://hua.test/api/intake", { headers });
const cookieFrom = (cookie: string | undefined) => {
  assert.ok(cookie);
  return cookie.split(";")[0];
};

test("untrusted forwarded headers cannot select or change a signed cookie client", () => {
  const first = intakeClient(request({ "CF-Connecting-IP": "1.2.3.4" }), env);
  assert.match(first.key, /^[a-f0-9]{64}$/);
  assert.match(first.cookie || "", /HttpOnly; SameSite=Lax/);
  assert.match(first.cookie || "", /; Secure/);
  const cookie = cookieFrom(first.cookie);
  const next = intakeClient(
    request({
      Cookie: cookie,
      "CF-Connecting-IP": "5.6.7.8",
      "X-Real-IP": "9.8.7.6",
      "X-Forwarded-For": "1.1.1.1",
    }),
    env,
  );
  assert.equal(next.key, first.key);
  assert.equal(next.cookie, undefined);
  assert.notEqual(intakeClient(request({ "CF-Connecting-IP": "1.2.3.4" }), env).key, first.key);
});

test("tampering or unsigned cookies cannot choose another client's bucket", () => {
  const first = intakeClient(request(), env);
  const second = intakeClient(request(), env);
  const cookie = cookieFrom(first.cookie);
  const signature = cookie.slice(cookie.lastIndexOf(".") + 1);
  const changed =
    cookie.slice(0, cookie.lastIndexOf(".") + 1) +
    (signature[0] === "a" ? "b" : "a") +
    signature.slice(1);
  assert.notEqual(intakeClient(request({ Cookie: changed }), env).key, first.key);
  assert.notEqual(intakeClient(request({ Cookie: cookie.split(".")[0] }), env).key, first.key);
  assert.notEqual(first.key, second.key);
  assert.throws(() => intakeClient(request(), { PAYLOAD_SECRET: "short" }), IntakeClientError);
});

test("local HTTP cookies remain usable without a Secure attribute", () => {
  const client = intakeClient(request(), { ...env, APP_URL: "http://127.0.0.1:3000" });
  assert.doesNotMatch(client.cookie || "", /; Secure/);
});

for (const [proxy, ipHeader] of [
  ["cloudflare", "CF-Connecting-IP"],
  ["nginx", "X-Real-IP"],
]) {
  test(`${proxy} uses only authenticated gateway's single validated IP`, () => {
    const trusted = { ...env, TRUSTED_PROXY: proxy, TRUSTED_PROXY_SECRET: proxySecret };
    const headers = { [ipHeader]: "203.0.113.1", "X-Hua-Proxy-Secret": proxySecret };
    const first = intakeClient(request(headers), trusted);
    assert.equal(first.cookie, undefined);
    assert.equal(
      intakeClient(request({ ...headers, "X-Forwarded-For": "1.2.3.4" }), trusted).key,
      first.key,
    );
    assert.notEqual(
      intakeClient(request({ ...headers, [ipHeader]: "203.0.113.2" }), trusted).key,
      first.key,
    );
    for (const badIP of ["", "203.0.113.1, 1.2.3.4", "unknown", "127.0.0.999", "1.2.3.4:123"]) {
      assert.throws(
        () => intakeClient(request({ ...headers, [ipHeader]: badIP }), trusted),
        IntakeClientError,
      );
    }
    for (const secret of ["", "wrong", proxySecret + "x"]) {
      assert.throws(
        () => intakeClient(request({ ...headers, "X-Hua-Proxy-Secret": secret }), trusted),
        IntakeClientError,
      );
    }
    assert.throws(
      () => intakeClient(request(headers), { ...trusted, TRUSTED_PROXY_SECRET: "short" }),
      IntakeClientError,
    );
    const ipv6 = intakeClient(request({ ...headers, [ipHeader]: "2001:db8::1" }), trusted);
    assert.equal(
      intakeClient(request({ ...headers, [ipHeader]: "2001:0db8:0:0:0:0:0:1" }), trusted).key,
      ipv6.key,
    );
  });
}

test("unknown proxy configuration fails closed", () => {
  assert.throws(
    () => intakeClient(request(), { ...env, TRUSTED_PROXY: "arbitrary" }),
    IntakeClientError,
  );
});

test("honeypot rejects filled or malformed technical fields and accepts ordinary payloads", () => {
  assert.equal(hasIntakeHoneypot({ kind: "request", contactFax: "spam" }), true);
  assert.equal(hasIntakeHoneypot({ kind: "apply", contactFax: " " }), true);
  assert.equal(hasIntakeHoneypot({ contactFax: 0 }), true);
  assert.equal(hasIntakeHoneypot({ contactFax: {} }), true);
  assert.equal(
    hasIntakeHoneypot({ contactFax: "", values: { website: "https://provider.example" } }),
    false,
  );
  assert.equal(hasIntakeHoneypot({ kind: "request" }), false);
  assert.equal(hasIntakeHoneypot(null), false);
});
