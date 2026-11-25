import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac, randomBytes } from "node:crypto";
const api = await import("../src/lib/subscription-feedback-webhook.ts").catch(() => null);
test("signed feedback verifier and normalizer exist", () =>
  assert.ok(api?.verifyFeedbackSignature && api?.parseFeedbackEvent));
const secret = "whsec_" + randomBytes(32).toString("base64");
const now = 1731705121000;
const body = Buffer.from('{"event_type":"ping","data":{"success":true}}');
const id = "msg_loFOjxBNrRLzqYUf";
function headers(bytes = body, seconds = String(now / 1000), key = secret) {
  const signature = createHmac("sha256", Buffer.from(key.slice(6), "base64"))
    .update(`${id}.${seconds}.`)
    .update(bytes)
    .digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": seconds,
    "svix-signature": "v1," + signature,
  });
}
test("Svix published fixed vector validates the original bytes", () => {
  assert.equal(
    api!.verifyFeedbackSignature(
      body,
      new Headers({
        "svix-id": id,
        "svix-timestamp": "1731705121",
        "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
      }),
      "whsec_plJ3nmyCDGBKInavdOK15jsl",
      now,
    ),
    id,
  );
});
for (const [name, bytes, h, key, clock] of [
  ["body changed", Buffer.concat([body, Buffer.from(" ")]), headers(), secret, now],
  ["wrong key", body, headers(), "whsec_" + randomBytes(32).toString("base64"), now],
  ["missing headers", body, new Headers(), secret, now],
  ["too old", body, headers(), secret, now + 301000],
  ["too far future", body, headers(), secret, now - 301000],
  ["bad secret", body, headers(), "whsec_!!!", now],
] as const)
  test("signature rejects " + name, () =>
    assert.throws(() => api!.verifyFeedbackSignature(bytes, h, key, clock)),
  );
test("signature rotation and boundary timestamps", () => {
  const h = headers();
  h.set(
    "svix-signature",
    "v1," + Buffer.alloc(32).toString("base64") + " " + h.get("svix-signature"),
  );
  assert.equal(api!.verifyFeedbackSignature(body, h, secret, now + 300000), id);
  assert.equal(api!.verifyFeedbackSignature(body, h, secret, now - 300000), id);
  const unicode = Buffer.from('{"主题":"虚构回执"}');
  assert.equal(api!.verifyFeedbackSignature(unicode, headers(unicode), secret, now), id);
});
const mailId = "56761188-7520-42d8-8898-ff6fc54ce618";
const payload = (type: string, data: object = {}) =>
  Buffer.from(
    JSON.stringify({
      type,
      created_at: "2026-11-25T00:00:00.000Z",
      data: { email_id: mailId, to: [" Fictional@EXAMPLE.INVALID "], ...data },
    }),
  );
for (const [type, data, kind] of [
  ["email.delivered", {}, "delivered"],
  ["email.complained", {}, "complaint"],
  ["email.bounced", { bounce: { type: "Permanent" } }, "hard-bounce"],
  ["email.suppressed", {}, "provider-suppressed"],
  [
    "suppression.added",
    { email: "fictional@example.invalid", source_id: mailId, origin: "bounce" },
    "provider-suppressed",
  ],
  [
    "suppression.added",
    { email: "fictional@example.invalid", source_id: null, origin: "manual" },
    "provider-suppressed",
  ],
] as const)
  test("normalizes " + type + JSON.stringify(data), () => {
    const result = api!.parseFeedbackEvent(payload(type, data));
    assert.equal(result!.kind, kind);
    assert.equal(result!.email, "fictional@example.invalid");
  });
for (const type of ["email.opened", "email.clicked", "email.failed", "suppression.removed"])
  test("ignores " + type, () => assert.equal(api!.parseFeedbackEvent(payload(type)), null));
test("temporary bounce is not a hard bounce", () =>
  assert.equal(
    api!.parseFeedbackEvent(payload("email.bounced", { bounce: { type: "Temporary" } })),
    null,
  ));
for (const [name, b] of [
  ["bad JSON", Buffer.from("{")],
  ["bad UTF8", Buffer.from([255])],
  [
    "multiple recipients",
    payload("email.delivered", { to: ["a@example.invalid", "b@example.invalid"] }),
  ],
  ["real address", payload("email.delivered", { to: ["a@example.com"] })],
  ["missing email ID", payload("email.delivered", { email_id: null })],
] as const)
  test("normalization rejects " + name, () => assert.throws(() => api!.parseFeedbackEvent(b)));
test("event timestamps must be ISO instants, including global suppressions", () => {
  assert.throws(() =>
    api!.parseFeedbackEvent(
      Buffer.from(
        JSON.stringify({
          type: "suppression.added",
          created_at: "0",
          data: { email: "fictional@example.invalid", source_id: null },
        }),
      ),
    ),
  );
});
for (const type of ["Transient", "Undetermined"])
  test("known non-permanent bounce is acknowledged without hard suppression: " + type, () =>
    assert.equal(api!.parseFeedbackEvent(payload("email.bounced", { bounce: { type } })), null),
  );

for (const created_at of [
  "2026-02-30T12:00:00.000Z",
  "2026-02-29T12:00:00+09:00",
  "1900-02-29T12:00:00Z",
  "2026-04-31T12:00:00-08:00",
  "2026-11-25T24:00:00Z",
  "2026-11-25T12:00:00+24:00",
])
  test("rejects impossible source instant " + created_at, () => {
    const event = JSON.parse(payload("email.delivered").toString());
    assert.throws(() =>
      api!.parseFeedbackEvent(Buffer.from(JSON.stringify({ ...event, created_at }))),
    );
  });
for (const [created_at, occurredAt] of [
  ["2024-02-29T12:00:00.123456789+09:00", "2024-02-29T03:00:00.123Z"],
  ["2000-02-29T12:00:00Z", "2000-02-29T12:00:00.000Z"],
  ["2026-03-01T00:30:00+14:00", "2026-02-28T10:30:00.000Z"],
  ["2026-12-31T23:30:00-02:00", "2027-01-01T01:30:00.000Z"],
])
  test("preserves valid local date and offset " + created_at, () => {
    const event = JSON.parse(payload("email.delivered").toString());
    const result = api!.parseFeedbackEvent(Buffer.from(JSON.stringify({ ...event, created_at })));
    assert.equal(result!.sourceTime, created_at);
    assert.equal(result!.occurredAt, occurredAt);
  });
