import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { readSharedFactEditor } from "../../src/server/immigration/shared-editor";
import { listPublicPolicies } from "../../src/server/immigration/public";
import { mutateSharedPolicyFacts } from "../../src/server/immigration/shared-facts-service";
import { mutateSharedPolicyNote } from "../../src/server/immigration/shared-notes-service";
import { relationID } from "../../src/cms/access";
import { policyFixture } from "../helpers/policy-workflow-fixture";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c[456]_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || (!clone && !ci))
  throw Error("Disposable shared-editor clone or CI only");
const oldFlag = process.env.VISA_CHECKER_ENABLED;
process.env.VISA_CHECKER_ENABLED = "true";
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, editor, reviewer, outsider, admin }) => {
    const before = await readSharedFactEditor(p, editor);
    assert.equal(before.policy.verifiedBy, editor.id);
    assert.match(before.policy.lastVerifiedOn!, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(before.countries.some((c) => c.code === "XZ"));
    assert.ok(before.verifiers.some((v) => v.id === reviewer.id));
    assert.ok(!before.verifiers.some((v) => v.id === outsider.id));
    await assert.rejects(() => readSharedFactEditor(p, outsider), /权限|板块/);
    await assert.rejects(() => readSharedFactEditor(p, editor, NaN), /编号/);
    await assert.rejects(() => readSharedFactEditor(p, editor, 0), /编号/);
    await assert.rejects(() => readSharedFactEditor(p, editor, 2147483647));
    const facts = {
      countryCode: "XZ",
      countryNameEn: "Fictional DEMO XZ",
      countryNameZh: "虚构演示XZ",
      policyType: "transit-240h",
      maximumStay: 240,
      stayUnit: "hours",
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
      portsAndRegions: ["Fictional port; onward ticket to a third country required"],
      officialSourceUrl: "https://example.invalid/policy",
      lastVerifiedOn: "2026-01-01",
      verifiedBy: editor.id,
      internalNotes: "NEVER PUBLIC",
    };
    let draft = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      contentKey: key,
      facts,
    });
    const group = Number(relationID(draft.group));
    let desk = await readSharedFactEditor(p, editor, group);
    assert.equal(desk.policy.maxStayHours, 240);
    assert.equal(desk.policy.maxStayDays, null);
    assert.equal(desk.rows.find((r) => r.id === group)?.country, "虚构演示XZ");
    assert.equal(desk.permissions.canEdit, true);
    assert.equal(desk.permissions.canReview, false);
    assert.equal((await readSharedFactEditor(p, reviewer, group)).permissions.canEdit, false);
    await p.update({ collection: "staff", id: editor.id, data: { active: false }, user: admin });
    await assert.rejects(() => readSharedFactEditor(p, editor, group), /权限|有效/);
    await p.update({ collection: "staff", id: editor.id, data: { active: true }, user: admin });
    draft = await mutateSharedPolicyFacts(p, editor, {
      action: "submit",
      groupId: group,
      revision: draft.revision,
    });
    await assert.rejects(() =>
      mutateSharedPolicyFacts(p, editor, {
        action: "publish",
        groupId: group,
        revision: draft.revision,
        policyReviewed: true,
      }),
    );
    draft = await mutateSharedPolicyFacts(p, reviewer, {
      action: "return",
      groupId: group,
      revision: draft.revision,
      note: "请补口岸条件",
    });
    assert.equal((await readSharedFactEditor(p, editor, group)).draft?.reviewNote, "请补口岸条件");
    draft = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      groupId: group,
      revision: draft.revision,
      facts,
    });
    draft = await mutateSharedPolicyFacts(p, editor, {
      action: "submit",
      groupId: group,
      revision: draft.revision,
    });
    draft = await mutateSharedPolicyFacts(p, reviewer, {
      action: "publish",
      groupId: group,
      revision: draft.revision,
      policyReviewed: true,
    });
    desk = await readSharedFactEditor(p, editor, group);
    assert.equal(desk.versions.length, 1);
    const active = Number(relationID(desk.group?.activeFactVersion));
    const legacy = (
      await p.find({ collection: "content-published", pagination: false, depth: 0 })
    ).docs.filter((s) => {
      const b = s.body;
      return (
        s.active &&
        b &&
        typeof b === "object" &&
        !Array.isArray(b) &&
        b.kind === "immigration-policy"
      );
    });
    if (legacy.length) await assert.rejects(() => listPublicPolicies(p, "zh"), /混存|切换/);
    // Only disposable clone/CI fixtures: temporarily hide old snapshots and restore in finally.
    for (const row of legacy)
      await p.update({ collection: "content-published", id: row.id, data: { active: false } });
    try {
      const zh = await listPublicPolicies(p, "zh"),
        en = await listPublicPolicies(p, "en");
      assert.deepEqual(zh, en);
      const output = zh.find((v) => v.countryNameEn === facts.countryNameEn)!;
      assert.equal(output.maxStayHours, 240);
      assert.equal(output.publicNotes, "");
      assert.ok(!("verifiedBy" in output));
      assert.ok(!JSON.stringify(output).includes("NEVER PUBLIC"));
      assert.deepEqual(await listPublicPolicies(p, "fr"), []);
      let note = await mutateSharedPolicyNote(p, editor, {
        action: "save",
        groupId: group,
        locale: "zh",
        factVersion: active,
        body: { title: "演示说明", slug: key, publicNotes: "仅中文已核实说明" },
      });
      note = await mutateSharedPolicyNote(p, editor, {
        action: "submit",
        groupId: group,
        locale: "zh",
        factVersion: active,
        revision: note.revision,
      });
      note = await mutateSharedPolicyNote(p, reviewer, {
        action: "publish",
        groupId: group,
        locale: "zh",
        factVersion: active,
        revision: note.revision,
        noteReviewed: true,
      });
      assert.equal(
        (await listPublicPolicies(p, "zh")).find((v) => v.countryNameEn === facts.countryNameEn)
          ?.publicNotes,
        "仅中文已核实说明",
      );
      assert.equal(
        (await listPublicPolicies(p, "en")).find((v) => v.countryNameEn === facts.countryNameEn)
          ?.publicNotes,
        "",
      );
      await mutateSharedPolicyNote(p, editor, {
        action: "save",
        groupId: group,
        locale: "zh",
        factVersion: active,
        revision: note.revision,
        body: { publicNotes: "NEVER PUBLISH WORKING TEXT" },
      });
      assert.equal(
        (await listPublicPolicies(p, "zh")).find((v) => v.countryNameEn === facts.countryNameEn)
          ?.publicNotes,
        "仅中文已核实说明",
      );
      draft = await mutateSharedPolicyFacts(p, editor, {
        action: "save",
        groupId: group,
        revision: draft.revision,
        facts: { ...facts, maximumStay: 120 },
      });
      draft = await mutateSharedPolicyFacts(p, editor, {
        action: "submit",
        groupId: group,
        revision: draft.revision,
      });
      const [reading, published] = await Promise.all([
        listPublicPolicies(p, "zh"),
        mutateSharedPolicyFacts(p, reviewer, {
          action: "publish",
          groupId: group,
          revision: draft.revision,
          policyReviewed: true,
        }),
      ]);
      draft = published;
      const concurrent = reading.find((v) => v.countryNameEn === facts.countryNameEn)!;
      assert.ok(concurrent.maxStayHours === 240 || concurrent.maxStayHours === 120);
      assert.equal(
        concurrent.publicNotes,
        concurrent.maxStayHours === 240 ? "仅中文已核实说明" : "",
      );
      const fresh = await listPublicPolicies(p, "zh");
      assert.equal(fresh.find((v) => v.countryNameEn === facts.countryNameEn)?.maxStayHours, 120);
      assert.equal(fresh.find((v) => v.countryNameEn === facts.countryNameEn)?.publicNotes, "");
      assert.deepEqual(fresh, await listPublicPolicies(p, "en"));
      console.log(
        "PASS authenticated shared editor, return/revise/second review, consistent facts, independent immutable notes and concurrent public reads",
      );
    } finally {
      await mutateSharedPolicyFacts(p, reviewer, {
        action: "unpublish",
        groupId: group,
        revision: draft.revision,
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
