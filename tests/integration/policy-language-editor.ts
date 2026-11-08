import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import {
  readSharedPolicyNote,
  mutateSharedPolicyNote,
} from "../../src/server/immigration/shared-notes-service";
import {
  mutateSharedPolicyFacts,
  readSharedPolicyFacts,
} from "../../src/server/immigration/shared-facts-service";
import { readPolicyBanner } from "../../src/server/immigration/banner";
import { listPublicPolicies } from "../../src/server/immigration/public";
import { mutateContent } from "../../src/server/content/service";
import { relationID } from "../../src/cms/access";
import { sharedPolicyForm } from "../../src/lib/policy-shared-form";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c[56]_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || (!clone && !ci))
  throw Error("Disposable language-editor clone or CI only");
const oldFlag = process.env.VISA_CHECKER_ENABLED;
process.env.VISA_CHECKER_ENABLED = "true";
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, body, editor, reviewer, outsider, admin }) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
      new Date(),
    );
    const future = (days: number) =>
      new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
    const facts = {
      countryCode: "XY",
      countryNameEn: "Fictional DEMO",
      countryNameZh: "虚构演示",
      policyType: "unilateral",
      maximumStay: 30,
      stayUnit: "days",
      validFrom: "2026-01-01",
      validUntil: future(10),
      portsAndRegions: ["Fictional condition"],
      officialSourceUrl: "https://example.invalid/facts",
      lastVerifiedOn: today,
      verifiedBy: editor.id,
      internalNotes: "PRIVATE FACT NEVER EXPLAIN",
    };
    let fd = await mutateSharedPolicyFacts(p, editor, { action: "save", contentKey: key, facts });
    const groupId = Number(relationID(fd.group));
    const initial = await readSharedPolicyNote(p, editor, groupId, "zh");
    assert.equal(initial.locale, "zh");
    assert.equal(initial.facts, null);
    assert.match(initial.defaultBody.title, /虚构演示/);
    assert.equal(initial.defaultBody.slug, key);
    assert.equal(initial.permissions.canEdit, true);
    assert.equal(initial.permissions.canReview, false);
    await assert.rejects(() => readSharedPolicyNote(p, outsider, groupId, "zh"), /权限|板块/);
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    await assert.rejects(() => readSharedPolicyNote(p, editor, groupId, "zh"), /权限|有效/);
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: true } });
    fd = await mutateSharedPolicyFacts(p, editor, {
      action: "submit",
      groupId,
      revision: fd.revision,
    });
    fd = await mutateSharedPolicyFacts(p, reviewer, {
      action: "publish",
      groupId,
      revision: fd.revision,
      policyReviewed: true,
    });
    const first = await readSharedPolicyNote(p, editor, groupId, "zh");
    const active = Number(relationID(first.group.activeFactVersion));
    const firstVersion = active;
    const block = { type: "policy-banner", text: key };
    const banner = (locale = "en") => readPolicyBanner(p, block, locale, today);
    const legacy = (
      await p.find({ collection: "content-published", pagination: false, depth: 0 })
    ).docs.filter(
      ({ body, active }) =>
        active &&
        body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        body.kind === "immigration-policy",
    );
    try {
      if (legacy.length) await assert.rejects(() => banner(), /混存|切换/);
      for (const row of legacy)
        await p.update({ collection: "content-published", id: row.id, data: { active: false } });
      assert.equal(first.factRevision, 1);
      assert.equal(first.facts?.maxStayDays, 30);
      assert.ok(!("verifiedBy" in first.facts!));
      assert.ok(!JSON.stringify(first.facts).includes("PRIVATE FACT"));
      const en = await readSharedPolicyNote(p, reviewer, groupId, "en");
      assert.deepEqual(first.facts, en.facts);
      assert.match(en.defaultBody.title, /Fictional DEMO/);
      assert.equal(en.permissions.canEdit, false);
      assert.equal((await banner())?.status, "expiring");
      assert.deepEqual(await banner(), await banner("zh"));
      assert.equal(
        (await readPolicyBanner(p, { ...block, text: key + "-missing" }, "zh", today))?.status,
        "unconfirmed",
      );
      let note = await mutateSharedPolicyNote(p, editor, {
        action: "save",
        groupId,
        locale: "zh",
        factVersion: active,
        body: { ...first.defaultBody, publicNotes: "  30天\n中文演示原文  " },
      });
      const warning = await readSharedPolicyNote(p, editor, groupId, "zh");
      assert.ok(warning.warning);
      assert.equal(warning.draft?.publicNotes, "  30天\n中文演示原文  ");
      note = await mutateSharedPolicyNote(p, editor, {
        action: "submit",
        groupId,
        locale: "zh",
        factVersion: active,
        revision: note.revision,
      });
      note = await mutateSharedPolicyNote(p, reviewer, {
        action: "publish",
        groupId,
        locale: "zh",
        factVersion: active,
        revision: note.revision,
        noteReviewed: true,
      });
      const noteVersion = Number(relationID(note.publishedNoteVersion));
      assert.equal(
        (await readSharedPolicyNote(p, editor, groupId, "zh")).draft?.needsReview,
        false,
      );
      assert.equal((await readSharedPolicyNote(p, editor, groupId, "en")).draft, null);
      assert.equal(
        (await listPublicPolicies(p, "en")).find((v) => v.countryNameEn === facts.countryNameEn)
          ?.publicNotes,
        "",
      );
      fd = await mutateSharedPolicyFacts(p, editor, {
        action: "save",
        groupId,
        revision: fd.revision,
        facts: { ...facts, maximumStay: 60, validUntil: future(90) },
      });
      assert.equal((await readSharedPolicyNote(p, editor, groupId, "zh")).facts?.maxStayDays, 30);
      fd = await mutateSharedPolicyFacts(p, editor, {
        action: "submit",
        groupId,
        revision: fd.revision,
      });
      const [reading, published] = await Promise.all([
        banner(),
        mutateSharedPolicyFacts(p, reviewer, {
          action: "publish",
          groupId,
          revision: fd.revision,
          policyReviewed: true,
        }),
      ]);
      fd = published;
      assert.ok(reading?.policy?.maxStayDays === 30 || reading?.policy?.maxStayDays === 60);
      assert.equal(reading.status, reading.policy.maxStayDays === 30 ? "expiring" : "extended");
      const changed = await readSharedPolicyNote(p, editor, groupId, "zh");
      assert.equal(changed.factRevision, 2);
      assert.equal(changed.facts?.maxStayDays, 60);
      assert.equal(changed.draft?.needsReview, true);
      assert.notEqual(
        relationID(changed.draft?.basedOnFactVersion),
        relationID(changed.group.activeFactVersion),
      );
      const extended = await banner();
      assert.equal(extended?.status, "extended");
      assert.equal(extended.previous?.maxStayDays, 30);
      assert.equal(extended.policy?.maxStayDays, 60);
      assert.ok(!JSON.stringify(extended).includes("PRIVATE FACT"));
      assert.deepEqual(extended, await banner("zh"));
      const restored = await mutateSharedPolicyNote(p, editor, {
        action: "restore",
        groupId,
        locale: "zh",
        factVersion: Number(relationID(changed.group.activeFactVersion)),
        revision: changed.draft!.revision,
        versionId: noteVersion,
      });
      assert.equal(restored.reviewState, "draft");
      assert.equal(restored.publicNotes, "  30天\n中文演示原文  ");
      assert.equal(
        (await listPublicPolicies(p, "zh")).find((v) => v.countryNameEn === facts.countryNameEn)
          ?.publicNotes,
        "",
      );
      fd = await mutateSharedPolicyFacts(p, editor, {
        action: "restore",
        groupId,
        revision: fd.revision,
        versionId: firstVersion,
      });
      assert.equal(
        sharedPolicyForm((await readSharedPolicyFacts(p, editor, groupId)).draft.facts).maxStayDays,
        30,
      );
      assert.equal((await readSharedPolicyNote(p, editor, groupId, "zh")).facts?.maxStayDays, 60);
      assert.equal((await banner())?.policy?.maxStayDays, 60);
      fd = await mutateSharedPolicyFacts(p, reviewer, {
        action: "unpublish",
        groupId,
        revision: fd.revision,
      });
      let old = await mutateContent(p, editor, {
        action: "save",
        body,
        policy: { ...policyFacts(editor.id), validUntil: future(10), lastVerifiedOn: today },
      });
      old = await mutateContent(p, editor, {
        action: "submit",
        id: old.id,
        revision: old.revision,
      });
      await mutateContent(p, reviewer, {
        action: "publish",
        id: old.id,
        revision: old.revision,
        policyReviewed: true,
      });
      assert.deepEqual(await banner(), { status: "unconfirmed", policy: null, previous: null });
      console.log(
        "PASS atomic note editor facts/defaults/roles, language independence, stale recheck/history, shared banner expiry/extension/concurrency and no legacy fallback after unpublish",
      );
    } finally {
      const current = await readSharedPolicyFacts(p, reviewer, groupId);
      if (current.group.activeFactVersion)
        await mutateSharedPolicyFacts(p, reviewer, {
          action: "unpublish",
          groupId,
          revision: current.draft.revision,
        });
      for (const row of legacy)
        await p.update({ collection: "content-published", id: row.id, data: { active: true } });
    }
  });
} finally {
  if (oldFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = oldFlag;
  await p.destroy();
}
process.exit(0);
