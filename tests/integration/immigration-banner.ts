import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { readPolicyBanner } from "../../src/server/immigration/banner";
import { mutateContent } from "../../src/server/content/service";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";

if (process.env.APP_ENV !== "local") throw Error("Dedicated local fixtures only");
const p = await getPayload({ config });
const oldFlag = process.env.VISA_CHECKER_ENABLED;
const http = process.argv.includes("--http");
const off = process.argv.includes("--disabled");
const base = process.env.APP_URL || "http://127.0.0.1:3000";
if (http && base !== "http://127.0.0.1:3000") throw Error("Local HTTP only");
try {
  process.env.VISA_CHECKER_ENABLED = "true";
  await policyFixture(p, async ({ key, body, admin, editor, reviewer, outsider }) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
      new Date(),
    );
    const future = (days: number) =>
      new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
    const block = { type: "policy-banner" as const, text: key, policyUnconfirmed: false };
    const read = () => readPolicyBanner(p, block, "en", today);
    const unknown = { status: "unconfirmed", policy: null, previous: null };
    assert.deepEqual(await read(), unknown);
    let policy = await mutateContent(p, editor, {
      action: "save",
      body,
      policy: { ...policyFacts(editor.id), validUntil: future(10), lastVerifiedOn: today },
    });
    assert.deepEqual(await read(), unknown);
    policy = await mutateContent(p, editor, {
      action: "submit",
      id: policy.id,
      revision: policy.revision,
    });
    assert.deepEqual(await read(), unknown);
    policy = await mutateContent(p, reviewer, {
      action: "publish",
      id: policy.id,
      revision: policy.revision,
      policyReviewed: true,
    });
    assert.equal((await read())?.status, "expiring");
    assert.deepEqual(await readPolicyBanner(p, block, "zh", today), unknown);
    const articleBody = {
      ...body,
      kind: "guide",
      contentKey: `${key}-guide`,
      slug: `${key}-guide`,
      blocks: [{ type: "paragraph", text: "Fictional local article" }, block],
      sources: [{ id: "test", title: "Fictional source", url: "https://example.invalid/source" }],
    };
    let article = await mutateContent(p, outsider, { action: "save", body: articleBody });
    article = await mutateContent(p, outsider, {
      action: "submit",
      id: article.id,
      revision: article.revision,
    });
    await assert.rejects(() =>
      mutateContent(p, outsider, {
        action: "publish",
        id: policy.id,
        revision: policy.revision,
        policyReviewed: true,
      }),
    );
    await assert.rejects(() =>
      p.find({ collection: "immigration-policies", user: outsider, overrideAccess: false }),
    );
    await assert.rejects(() =>
      p.findVersions({ collection: "immigration-policies", user: outsider, overrideAccess: false }),
    );
    article = await mutateContent(p, admin, {
      action: "publish",
      id: article.id,
      revision: article.revision,
    });
    async function page(status: string) {
      if (!http) return;
      const response = await fetch(`${base}/en/guides/${key}-guide`);
      assert.equal(response.status, 200);
      const html = await response.text();
      if (off) {
        assert.doesNotMatch(html, /data-policy-banner|\/tools\/china-visa-free-checker/);
      } else {
        assert.match(html, new RegExp(`data-policy-banner="${status}"`));
        assert.match(html, /https:\/\/example.invalid\/policy/);
        assert.match(html, new RegExp(today));
        assert.doesNotMatch(html, /Private verification fixture|internalNotes|verifiedBy/);
      }
    }
    await page("expiring");
    if (http) {
      let zhArticle = await mutateContent(p, outsider, {
        action: "save",
        body: { ...articleBody, locale: "zh" },
      });
      zhArticle = await mutateContent(p, outsider, {
        action: "submit",
        id: zhArticle.id,
        revision: zhArticle.revision,
      });
      await mutateContent(p, admin, {
        action: "publish",
        id: zhArticle.id,
        revision: zhArticle.revision,
      });
      const zhHTML = await (await fetch(`${base}/zh/guides/${key}-guide`)).text();
      if (!off) assert.match(zhHTML, /data-policy-banner="unconfirmed"/);
      else assert.doesNotMatch(zhHTML, /data-policy-banner/);
      assert.doesNotMatch(zhHTML, /Fictional country|https:\/\/example.invalid\/policy/);
    }
    policy = await mutateContent(p, editor, {
      action: "save",
      id: policy.id,
      revision: policy.revision,
      body,
      policy: { ...policyFacts(editor.id), validUntil: future(90), lastVerifiedOn: today },
    });
    assert.equal((await read())?.status, "expiring");
    await page("expiring");
    policy = await mutateContent(p, editor, {
      action: "submit",
      id: policy.id,
      revision: policy.revision,
    });
    assert.equal((await read())?.status, "expiring");
    policy = await mutateContent(p, reviewer, {
      action: "publish",
      id: policy.id,
      revision: policy.revision,
      policyReviewed: true,
    });
    const extended = await read();
    assert.equal(extended?.status, "extended");
    assert.equal(extended?.previous?.validUntil, future(10));
    await page("extended");
    article = await mutateContent(p, outsider, {
      action: "save",
      id: article.id,
      revision: article.revision,
      body: { ...articleBody, blocks: [{ ...block, policyUnconfirmed: true }] },
    });
    await page("extended");
    article = await mutateContent(p, outsider, {
      action: "submit",
      id: article.id,
      revision: article.revision,
    });
    await mutateContent(p, admin, {
      action: "publish",
      id: article.id,
      revision: article.revision,
    });
    await page("unconfirmed");
    assert.equal(
      (await readPolicyBanner(p, { ...block, policyUnconfirmed: true }, "en", today))?.status,
      "unconfirmed",
    );
    await mutateContent(p, reviewer, {
      action: "unpublish",
      id: policy.id,
      revision: policy.revision,
    });
    assert.deepEqual(await read(), unknown);
    if (http && !off) {
      const gone = await (await fetch(`${base}/en/guides/${key}-guide`)).text();
      assert.match(gone, /data-policy-banner="unconfirmed"/);
      assert.doesNotMatch(gone, /https:\/\/example.invalid\/policy/);
    }
    assert.deepEqual(
      await readPolicyBanner(p, { ...block, text: "never-existed" }, "en", today),
      unknown,
    );
    const unreachable = new Proxy(p, {
      get(target, property, receiver) {
        if (property === "find") throw Error("Unexpected DB access");
        return Reflect.get(target, property, receiver);
      },
    });
    process.env.VISA_CHECKER_ENABLED = "false";
    assert.equal(await readPolicyBanner(unreachable, block, "en", today), null);
    process.env.VISA_CHECKER_ENABLED = "true";
    assert.equal(await readPolicyBanner(unreachable, block, "es", today), null);
    await assert.rejects(() => readPolicyBanner(unreachable, block, "en", today), /Unexpected DB/);
    console.log(
      `PASS banner formal lifecycle, previous published revision, guide workflow, private access refusal, disabled guard and DB errors${http ? " + real HTTP" : ""}`,
    );
  });
} finally {
  if (oldFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = oldFlag;
  await p.destroy();
}
process.exit(0);
