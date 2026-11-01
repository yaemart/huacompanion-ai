import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { readPolicyEditor } from "../../src/server/immigration/editor";
import { mutateContent } from "../../src/server/content/service";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, body, editor, reviewer, outsider, admin }) => {
    await assert.rejects(() => readPolicyEditor(p, null), { status: 403 });
    await assert.rejects(() => readPolicyEditor(p, outsider), { status: 403 });
    const blank = await readPolicyEditor(p, editor);
    assert.equal(blank.draft, null);
    assert.equal(blank.policy.maxStayDays, null);
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
    assert.ok(!JSON.stringify(view).includes("@example.invalid"));
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
