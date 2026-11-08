import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import type { ContentDraft } from "../../payload-types";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
const base = process.env.APP_URL || "http://127.0.0.1:3000";
if (process.env.APP_ENV !== "local" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Local only");
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, body, editor, reviewer, outsider, password, admin }) => {
    const login = async (email: string) =>
      (await p.login({ collection: "staff", data: { email, password } })).token;
    const edit = await login(editor.email),
      review = await login(reviewer.email),
      outside = await login(outsider.email);
    assert.ok(edit && review && outside);
    const post = (data: object, token?: string, origin = base) =>
      fetch(base + "/api/content-center", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(token ? { Authorization: `JWT ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
    assert.equal((await post({ action: "save", body })).status, 403);
    assert.equal(
      (await post({ action: "save", body }, edit, "https://example.invalid")).status,
      403,
    );
    assert.equal((await post({ action: "save", body }, outside)).status, 403);
    const invalid = await post(
      { action: "save", body, policy: { ...policyFacts(editor.id), countryCode: "ZZ" } },
      edit,
    );
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /国家/);
    const save = await post({ action: "save", body, policy: policyFacts(editor.id) }, edit);
    assert.equal(save.status, 200);
    let draft = (await save.json()) as ContentDraft;
    const duplicate = await post({ action: "save", body, policy: policyFacts(editor.id) }, edit);
    assert.equal(duplicate.status, 409);
    assert.match(await duplicate.text(), /标识.*已存在/);
    assert.equal(draft.kind, "immigration-policy");
    assert.ok(!JSON.stringify(draft.body).includes("internalNotes"));
    const step = async (action: string, token: string, extra: object = {}) => {
      const response = await post(
        { action, id: draft.id, revision: draft.revision, ...extra },
        token,
      );
      assert.equal(response.status, 200);
      draft = (await response.json()) as ContentDraft;
    };
    const versions = await fetch(base + `/api/content-center?versions=${draft.id}`, {
      headers: { Authorization: `JWT ${outside}` },
    });
    assert.ok([400, 403, 404].includes(versions.status));
    assert.ok(!(await versions.text()).includes(key));
    const publicBefore = (await (await fetch(base + "/api/public/content?locale=en")).json()) as {
      total: number;
    };
    await step("submit", edit);
    assert.equal(
      (
        await post(
          { action: "publish", id: draft.id, revision: draft.revision, policyReviewed: true },
          edit,
        )
      ).status,
      403,
    );
    assert.equal(
      (await post({ action: "publish", id: draft.id, revision: draft.revision }, review)).status,
      400,
    );
    await step("publish", review, { policyReviewed: true });
    const publicAfter = (await (await fetch(base + "/api/public/content?locale=en")).json()) as {
      total: number;
      items: unknown[];
    };
    assert.equal(publicAfter.total, publicBefore.total);
    assert.ok(!JSON.stringify(publicAfter).includes(key));
    const desk = await fetch(base + "/api/content-center", {
      headers: { Authorization: `JWT ${edit}` },
    });
    assert.equal(desk.status, 200);
    const text = await desk.text();
    assert.ok(text.includes(key));
    assert.ok(!text.includes("Private verification fixture"));
    for (const token of [undefined, edit, outside]) {
      const response = await fetch(base + "/api/immigration-policies", {
        headers: token ? { Authorization: `JWT ${token}` } : {},
      });
      assert.ok([401, 403].includes(response.status));
    }
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    assert.equal(
      (await post({ action: "submit", id: draft.id, revision: draft.revision }, edit)).status,
      403,
    );
    console.log(
      "PASS HTTP JWT scope, origin, read/history isolation, reviewer confirmation, disabled old token and unpublished public surface",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
