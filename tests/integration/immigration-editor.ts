import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { readPolicyEditor } from "../../src/server/immigration/editor";
import { mutateContent } from "../../src/server/content/service";
import { readContentPreview } from "../../src/server/content/preview";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
import { policyVerificationDefaults } from "../../src/lib/immigration-policy-list";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, body, editor, reviewer, outsider, admin }) => {
    await assert.rejects(() => readPolicyEditor(p, null), { status: 403 });
    await assert.rejects(() => readPolicyEditor(p, outsider), { status: 403 });
    const blank = await readPolicyEditor(p, editor);
    assert.equal(blank.draft, null);
    assert.equal(blank.policy.maxStayDays, null);
    assert.equal(blank.policy.verifiedBy, editor.id);
    assert.equal(
      blank.policy.lastVerifiedOn,
      policyVerificationDefaults(editor.id, new Date()).lastVerifiedOn,
    );
    assert.equal(blank.today, blank.policy.lastVerifiedOn);
    assert.ok(!blank.verifiers.some((person) => person.id === outsider.id));
    assert.ok(
      blank.verifiers.every((person) => Object.keys(person).sort().join(",") === "id,name"),
    );
    await assert.rejects(() => readPolicyEditor(p, editor, 0), { status: 400 });
    let draft = await mutateContent(p, editor, {
      action: "save",
      body: { ...body, blocks: [] },
      policy: policyFacts(editor.id),
    });
    const view = await readPolicyEditor(p, reviewer, draft.id);
    assert.equal(view.draft?.revision, draft.revision);
    assert.equal(view.policy.countryCode, "XY");
    assert.equal(view.policy.internalNotes, "Private verification fixture");
    const row = view.policyRows.find((row) => row.id === draft.id);
    assert.equal(row?.country, "虚构国家");
    assert.equal(row?.lastVerifiedOn, "2026-01-01");
    assert.ok(!JSON.stringify(row).includes("Private verification fixture"));
    assert.equal(
      view.policy.verifiedBy,
      editor.id,
      "Opening as another user keeps original verifier",
    );
    await p.update({
      collection: "immigration-policies",
      id: (draft.body as { policyRef: { id: number } }).policyRef.id,
      data: { verifiedBy: null, lastVerifiedOn: null },
    });
    const incomplete = await readPolicyEditor(p, reviewer, draft.id);
    assert.equal(incomplete.policy.verifiedBy, null);
    assert.equal(
      incomplete.policy.lastVerifiedOn,
      null,
      "Opening an old incomplete record never fills defaults",
    );
    await p.update({
      collection: "immigration-policies",
      id: (draft.body as { policyRef: { id: number } }).policyRef.id,
      data: { verifiedBy: editor.id, lastVerifiedOn: "2026-01-01" },
    });
    assert.ok(!JSON.stringify(view).includes("@example.invalid"));
    const oldRevision = draft.revision;
    let changed = false;
    const concurrent = new Proxy(p, {
      get(target, property, receiver) {
        if (property !== "findByID") return Reflect.get(target, property, receiver);
        return (async (args: Parameters<typeof p.findByID>[0]) => {
          const old = await p.findByID(args);
          if (!changed && args.collection === "content-drafts" && Number(args.id) === draft.id) {
            changed = true;
            draft = await mutateContent(p, editor, {
              action: "save",
              id: draft.id,
              revision: draft.revision,
              body: { ...body, title: "Concurrent preview revision", blocks: [] },
              policy: { ...policyFacts(editor.id), maxStayDays: 7 },
            });
          }
          return old;
        }) as typeof p.findByID;
      },
    });
    const oldFlag = process.env.VISA_CHECKER_ENABLED;
    try {
      process.env.VISA_CHECKER_ENABLED = "true";
      const preview = await readContentPreview(concurrent, reviewer, draft.id);
      assert.ok(changed, "A real DB save occurred between the two preview reads");
      assert.equal(preview.draft.revision, oldRevision + 1);
      assert.equal((preview.draft.body as { title: string }).title, "Concurrent preview revision");
      assert.equal(preview.policy?.maxStayDays, 7);
      await assert.rejects(() => readContentPreview(p, outsider, draft.id));
    } finally {
      if (oldFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
      else process.env.VISA_CHECKER_ENABLED = oldFlag;
    }
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    await assert.rejects(() => readPolicyEditor(p, editor, draft.id), { status: 403 });
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: true } });
    draft = await mutateContent(p, editor, {
      action: "submit",
      id: draft.id,
      revision: draft.revision,
    });
    await assert.doesNotReject(
      () =>
        mutateContent(p, reviewer, {
          action: "publish",
          id: draft.id,
          revision: draft.revision,
          policyReviewed: true,
        }),
      "Complete structured policy does not require a duplicate article paragraph",
    );
    let guide = await mutateContent(p, admin, {
      action: "save",
      body: {
        ...body,
        kind: "guide",
        contentKey: `${key}-guide`,
        slug: `${key}-guide`,
        blocks: [],
      },
    });
    await assert.rejects(() => readPolicyEditor(p, editor, guide.id), { status: 404 });
    guide = await mutateContent(p, admin, {
      action: "submit",
      id: guide.id,
      revision: guide.revision,
    });
    await assert.rejects(
      () =>
        mutateContent(p, admin, {
          action: "publish",
          id: guide.id,
          revision: guide.revision,
          overrideReason: "Fictional regression",
        }),
      /正文不能为空/,
    );
    const ref = (draft.body as { policyRef?: { id: number; revision: number } }).policyRef;
    assert.ok(ref);
    await p.update({
      collection: "immigration-policies",
      id: ref.id,
      data: { revision: ref.revision + 1 },
    });
    await assert.rejects(() => readPolicyEditor(p, editor, draft.id), { status: 409 });
    console.log(
      "PASS editor read scope, atomic reference revision, minimal verifiers, disabled cached staff and unchanged guide rules",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
