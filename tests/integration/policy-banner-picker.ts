import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { contentTransaction, ContentError, mutateContent } from "../../src/server/content/service";
import { policyBannerChoicesFor } from "../../src/server/immigration/banner-picker";
import { mutateSharedPolicyFacts } from "../../src/server/immigration/shared-facts-service";
import { readPolicyBanner } from "../../src/server/immigration/banner";
import { relationID } from "../../src/cms/access";
import { policyFacts, policyFixture } from "../helpers/policy-workflow-fixture";

const db = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(db.hostname, "127.0.0.1");
assert.ok(
  (db.port === "55442" && /^\/hua_banner_picker_[a-f0-9]{32}$/.test(db.pathname)) ||
    (db.port === "55438" && db.pathname === "/hua_companion" && process.env.CI === "true"),
);
const priorFlag = process.env.VISA_CHECKER_ENABLED;
process.env.VISA_CHECKER_ENABLED = "true";
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, admin, editor, reviewer, outsider }) => {
    const { maxStayDays, publicNotes, ...legacyFacts } = policyFacts(editor.id);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
      new Date(),
    );
    const facts = {
      ...legacyFacts,
      maximumStay: maxStayDays,
      stayUnit: "days",
      validUntil: new Date(Date.parse(today) + 10 * 86400000).toISOString().slice(0, 10),
      lastVerifiedOn: today,
    };
    const choices = (locale = "zh", actor = outsider, kind = "guide") =>
      contentTransaction(p, (req) => policyBannerChoicesFor(p, req, actor, kind, locale));
    const isConflict = (error: unknown) => error instanceof ContentError && error.status === 409;
    const isDenied = (error: unknown) => error instanceof ContentError && error.status === 403;
    const block = { type: "policy-banner", text: key };
    const articleBody = {
      kind: "guide",
      locale: "zh",
      contentKey: `${key}-guide`,
      slug: `${key}-guide`,
      title: "虚构政策横幅验收",
      blocks: [{ type: "paragraph", text: "仅本地测试" }, block],
      sources: [{ id: "s", title: "虚构资料", url: "https://example.invalid/source" }],
    };
    let fact = await mutateSharedPolicyFacts(p, editor, { action: "save", contentKey: key, facts });
    const groupId = Number(relationID(fact.group));
    try {
      assert.ok(!(await choices()).some((choice) => choice.key === key));
      await assert.rejects(choices("zh", editor), isDenied);
      await assert.rejects(choices("zh", reviewer), isDenied);
      await assert.rejects(choices("zh", outsider, "exhibition"), isDenied);
      await assert.rejects(choices("es"), /仅支持中英文/);
      await assert.rejects(
        mutateContent(p, outsider, { action: "save", body: articleBody }),
        isConflict,
      );
      fact = await mutateSharedPolicyFacts(p, editor, {
        action: "submit",
        groupId,
        revision: fact.revision,
      });
      assert.ok(!(await choices()).some((choice) => choice.key === key));
      fact = await mutateSharedPolicyFacts(p, reviewer, {
        action: "publish",
        groupId,
        revision: fact.revision,
        policyReviewed: true,
      });
      for (const locale of ["en", "zh"]) {
        const option = (await choices(locale)).find((choice) => choice.key === key);
        assert.ok(!JSON.stringify(option ?? {}).includes(publicNotes));
        assert.deepEqual(option, {
          key,
          countryCode: facts.countryCode,
          countryNameEn: facts.countryNameEn,
          countryNameZh: facts.countryNameZh,
          policyType: facts.policyType,
          validFrom: facts.validFrom,
          validUntil: facts.validUntil,
        });
      }
      const old = await p.create({
        collection: "content-published",
        data: {
          draftId: 999000000,
          routeKey: `immigration-policy:en:${key}`,
          revision: 1,
          publishedAt: new Date().toISOString(),
          publishedBy: admin.id,
          active: true,
          body: { kind: "immigration-policy", contentKey: key, locale: "en" },
        },
      });
      try {
        await assert.rejects(choices("en"), /混存/);
        await assert.rejects(
          mutateContent(p, outsider, { action: "save", body: articleBody }),
          /混存/,
        );
      } finally {
        await p.delete({ collection: "content-published", id: old.id });
      }
      let article = await mutateContent(p, outsider, { action: "save", body: articleBody });
      assert.equal((await readPolicyBanner(p, block, "zh", today))?.status, "expiring");
      const captured = await choices();
      assert.ok(captured.some((choice) => choice.key === key));
      fact = await mutateSharedPolicyFacts(p, reviewer, {
        action: "unpublish",
        groupId,
        revision: fact.revision,
      });
      assert.ok(!(await choices()).some((choice) => choice.key === key));
      assert.equal((await readPolicyBanner(p, block, "zh", today))?.status, "unconfirmed");
      const save = (body: object) =>
        mutateContent(p, outsider, {
          action: "save",
          id: article.id,
          revision: article.revision,
          body,
        });
      await assert.rejects(
        mutateContent(p, outsider, { action: "save", body: { ...articleBody, locale: "en" } }),
        isConflict,
      );
      await assert.rejects(
        save({ ...articleBody, blocks: [...articleBody.blocks, block] }),
        isConflict,
      );
      await assert.rejects(
        save({ ...articleBody, blocks: [{ ...block, text: key + "-missing" }] }),
        isConflict,
      );
      process.env.VISA_CHECKER_ENABLED = "false";
      assert.deepEqual(await choices(), []);
      await assert.rejects(
        mutateContent(p, outsider, { action: "save", body: articleBody }),
        isConflict,
      );
      article = await save({
        ...articleBody,
        title: "原有引用随旧稿保留",
        blocks: [{ ...block, policyUnconfirmed: true }, articleBody.blocks[0]],
      });
      assert.equal(article.title, "原有引用随旧稿保留");
      const submitted = await mutateContent(p, outsider, {
        action: "submit",
        id: article.id,
        revision: article.revision,
      });
      assert.equal(submitted.reviewState, "review");
    } finally {
      process.env.VISA_CHECKER_ENABLED = "true";
      const group = await p.findByID({ collection: "policy-groups", id: groupId });
      if (group.activeFactVersion)
        await mutateSharedPolicyFacts(p, reviewer, {
          action: "unpublish",
          groupId,
          revision: fact.revision,
        });
    }
  });
  console.log(
    "PASS published picker, scope, mixed-data guard, unpublish race, retained reference and disabled flag",
  );
} finally {
  if (priorFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = priorFlag;
  await p.destroy();
}
process.exit(0);
