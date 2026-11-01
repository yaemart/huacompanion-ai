import "dotenv/config";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent } from "../../src/server/content/service";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const url = new URL(base);
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || url.port !== "3000")
  throw Error("Dedicated local HTTP tests only");
const enabled = process.argv.includes("--enabled");
const route = "/tools/china-visa-free-checker";
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    await fetch(base + "/en");
    ready = true;
    break;
  } catch {
    await setTimeout(500);
  }
}
assert.ok(ready, "Local web process must be ready");
async function read(locale = "en") {
  const response = await fetch(`${base}/${locale}${route}`);
  assert.equal(
    response.status,
    enabled && (locale === "en" || locale === "zh") ? 200 : 404,
    locale,
  );
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  return response.text();
}
for (const locale of ["en", "zh", "es", "fr", "de", "it", "ar"]) {
  const html = await read(locale);
  if (enabled && (locale === "en" || locale === "zh")) {
    assert.match(html, /data-policy-reference/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    assert.match(html, new RegExp(`href="/${locale === "en" ? "zh" : "en"}${route}"`));
  } else assert.doesNotMatch(html, /data-policy-reference/);
}
for (const path of ["/en", "/zh", "/sitemap.xml", "/llms.txt"]) {
  const text = await (await fetch(base + path)).text();
  assert.doesNotMatch(
    text,
    /href="\/[^" ]+\/tools\/china-visa-free-checker|<loc>[^<]+\/tools\/china-visa-free-checker/,
  );
}
if (enabled) {
  const p = await getPayload({ config });
  try {
    await policyFixture(p, async ({ key, body, editor, reviewer }) => {
      const visible = `Visible-${key}`;
      const secret = `Private-${key}`;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
        new Date(),
      );
      const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
      const facts = {
        ...policyFacts(editor.id),
        policyType: "transit-240h",
        validFrom: yesterday,
        validUntil: null,
        lastVerifiedOn: today,
        publicNotes: visible,
        internalNotes: secret,
      };
      let draft = await mutateContent(p, editor, { action: "save", body, policy: facts });
      assert.doesNotMatch(await read(), new RegExp(visible));
      draft = await mutateContent(p, editor, {
        action: "submit",
        id: draft.id,
        revision: draft.revision,
      });
      assert.doesNotMatch(await read(), new RegExp(visible));
      draft = await mutateContent(p, reviewer, {
        action: "publish",
        id: draft.id,
        revision: draft.revision,
        policyReviewed: true,
      });
      const published = await read();
      assert.match(published, new RegExp(visible));
      assert.doesNotMatch(published, new RegExp(secret));
      assert.doesNotMatch(published, /verifiedBy|internalNotes|policyRef/);
      assert.match(published, /href="https:\/\/example.invalid\/policy"/);
      assert.match(published, new RegExp(today));
      assert.match(published.replace(/<!--.*?-->/g, "").replace(/<[^>]*>/g, " "), /240\s+hours/);
      assert.match(published, /third-country/);
      assert.doesNotMatch(await read("zh"), new RegExp(visible));
      let zh = await mutateContent(p, editor, {
        action: "save",
        body: { ...body, locale: "zh" },
        policy: {
          ...facts,
          policyType: "other",
          validFrom: yesterday,
          validUntil: yesterday,
          publicNotes: `${visible}-zh`,
        },
      });
      zh = await mutateContent(p, editor, { action: "submit", id: zh.id, revision: zh.revision });
      await mutateContent(p, reviewer, {
        action: "publish",
        id: zh.id,
        revision: zh.revision,
        policyReviewed: true,
      });
      const chinese = await read("zh");
      assert.match(chinese, new RegExp(`${visible}-zh`));
      assert.match(chinese, /该日期的政策尚未确认/);
      assert.doesNotMatch(chinese, new RegExp(secret));
      draft = await mutateContent(p, editor, {
        action: "save",
        id: draft.id,
        revision: draft.revision,
        body,
        policy: { ...facts, publicNotes: `Unpublished-${key}` },
      });
      const revised = await read();
      assert.match(revised, new RegExp(visible));
      assert.doesNotMatch(revised, new RegExp(`Unpublished-${key}`));
      await mutateContent(p, reviewer, {
        action: "unpublish",
        id: draft.id,
        revision: draft.revision,
      });
      assert.doesNotMatch(await read(), new RegExp(visible));
      console.log(
        "PASS real SSR lifecycle: drafts hidden, sources/dates/hours/conditions, language isolation, unchanged snapshot and unpublish",
      );
    });
  } finally {
    await p.destroy();
  }
}
console.log(
  `PASS ${enabled ? "enabled" : "disabled"} tool route matrix, language links, noindex and unchanged global discovery`,
);
process.exit(0);
