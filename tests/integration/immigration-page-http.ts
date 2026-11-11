import "dotenv/config";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent } from "../../src/server/content/service";
import { verifyPolicyFAQHTTP } from "../helpers/policy-faq-http";
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
  assert.equal(text.includes(route), enabled, `${path} follows the tool discovery switch`);
}
if (enabled) {
  const p = await getPayload({ config });
  try {
    await policyFixture(p, async ({ key, body, editor, reviewer, admin }) => {
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
      const faqKey = process.env.VISA_FAQ_CONTENT_KEYS;
      if (faqKey) await verifyPolicyFAQHTTP(p, admin, read, faqKey, today);
      const guideKey = process.env.VISA_GUIDE_CONTENT_KEY;
      if (guideKey) {
        assert.match(guideKey, /^policy-browser-fixture-[a-z-]+$/);
        assert.equal(
          (
            await p.count({
              collection: "content-drafts",
              where: { contentKey: { equals: guideKey } },
            })
          ).totalDocs,
          0,
          "Guide fixture must not overwrite existing content",
        );
        let guide: Awaited<ReturnType<typeof mutateContent>> | undefined;
        const title = `Fictional visa guide ${key}`;
        const slug = `${key}-visa-guide`;
        try {
          guide = await mutateContent(p, admin, {
            action: "save",
            body: {
              ...body,
              kind: "guide",
              contentKey: guideKey,
              slug,
              title,
              sources: [
                {
                  id: "fictional",
                  title: "Fixture source",
                  url: "https://example.invalid/visa",
                  checkedAt: today,
                },
              ],
            },
          });
          assert.ok(!(await read()).includes(title));
          guide = await mutateContent(p, admin, {
            action: "submit",
            id: guide.id,
            revision: guide.revision,
          });
          assert.ok(!(await read()).includes(title));
          guide = await mutateContent(p, admin, {
            action: "publish",
            id: guide.id,
            revision: guide.revision,
            overrideReason: "Fictional browser guide test",
          });
          const withGuide = await read();
          assert.ok(withGuide.includes(`href="/en/guides/${slug}"`));
          assert.ok(withGuide.includes(title));
          assert.ok(!(await read("zh")).includes(title));
          await mutateContent(p, admin, {
            action: "unpublish",
            id: guide.id,
            revision: guide.revision,
            overrideReason: "Fictional browser guide test cleanup",
          });
          assert.ok(!(await read()).includes(title));
          console.log(
            "PASS configured visa guide: draft/review hidden, published reference only, language isolation and unpublish",
          );
        } finally {
          if (guide) {
            for (const collection of [
              "content-published",
              "content-events",
              "content-quality",
              "content-quality-events",
            ] as const)
              await p.delete({ collection, where: { draftId: { equals: guide.id } } });
            await p.delete({ collection: "content-drafts", id: guide.id });
          }
        }
      }
    });
  } finally {
    await p.destroy();
  }
}
console.log(
  `PASS ${enabled ? "enabled" : "disabled"} tool route matrix, language links, noindex and unchanged global discovery`,
);
process.exit(0);
