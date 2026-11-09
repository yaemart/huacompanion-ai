import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { defaultInquiryReplies } from "../../src/lib/intake-receipt";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_client_d9_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
const base = process.env.APP_URL || "http://127.0.0.1:3000";
if (
  process.env.APP_ENV !== "local" ||
  url.hostname !== "127.0.0.1" ||
  (!clone && !ci) ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error("Disposable D9 clone or CI HTTP only");
const p = await getPayload({ config });
const original = await p.findGlobal({ slug: "workflow-settings", depth: 0 });
async function page(locale: string) {
  const r = await fetch(`${base}/${locale}/request`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.doesNotMatch(html, /enabledEvents|escalationHours|inquiryReplyZh|inquiryReplyEn/);
  return html;
}
try {
  assert.equal((await fetch(base + "/api/globals/workflow-settings")).status, 403);
  await p.updateGlobal({
    slug: "workflow-settings",
    data: { inquiryReplyZh: "", inquiryReplyEn: "" },
  });
  for (const locale of ["en", "zh"] as const) {
    assert.ok((await page(locale)).includes(defaultInquiryReplies[locale]));
  }
  const custom = {
    inquiryReplyZh: "DEMO ONLY 中文回复时间",
    inquiryReplyEn: "DEMO ONLY Custom English reply",
  };
  await p.updateGlobal({ slug: "workflow-settings", data: custom });
  for (const locale of ["en", "zh"] as const) {
    assert.ok(
      (await page(locale)).includes(
        locale === "zh" ? custom.inquiryReplyZh : custom.inquiryReplyEn,
      ),
    );
    const input = {
      kind: "request",
      locale,
      values: {
        categories: ["business"],
        city: "Shanghai",
        people: "1",
        datesUnknown: true,
        name: "DEMO D9 HTTP",
        email: `${randomUUID()}@example.invalid`,
        language: "English",
        consent: true,
      },
    };
    const key = randomUUID();
    const post = () =>
      fetch(base + "/api/intake", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(input),
      });
    const r = await post();
    if (!process.argv.includes("--intake-enabled")) {
      assert.equal(r.status, 503);
      assert.equal((await r.json()).error, "Intake is not enabled for this environment.");
      continue;
    }
    assert.equal(r.status, 201);
    const receipt = await r.json();
    assert.deepEqual(Object.keys(receipt).sort(), ["duplicate", "reference"]);
    assert.match(receipt.reference, /^HC-Q-/);
    const again = await post();
    assert.equal(again.status, 200);
    assert.equal((await again.json()).reference, receipt.reference);
  }
  await p.updateGlobal({
    slug: "workflow-settings",
    data: { inquiryReplyZh: "", inquiryReplyEn: "" },
  });
  assert.ok((await page("en")).includes(defaultInquiryReplies.en));
  assert.ok((await page("zh")).includes(defaultInquiryReplies.zh));
  console.log(
    "PASS production default/custom/cleared public replies, private settings denied/absent, trial intake gate (or explicit local receipts/idempotency)",
  );
} finally {
  await p.updateGlobal({
    slug: "workflow-settings",
    data: { inquiryReplyZh: original.inquiryReplyZh, inquiryReplyEn: original.inquiryReplyEn },
  });
  await p.destroy();
}
process.exit(0);
