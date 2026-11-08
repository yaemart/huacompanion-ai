import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
import { mutateContent } from "../../src/server/content/service";
import type { PolicyEditorData } from "../../src/server/immigration/editor";
const base = process.env.APP_URL || "http://127.0.0.1:3000";
if (process.env.APP_ENV !== "local" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Local only");
const endpoint = base + "/api/content-center/policy";
if (process.env.POLICY_EDITOR_TEST_ENABLED !== "true") {
  assert.equal((await fetch(endpoint)).status, 404);
  assert.equal(
    (await fetch(base + "/content-center?kind=immigration-policy", { redirect: "manual" })).status,
    404,
  );
  console.log("PASS policy read endpoint and workbench hidden by default");
}
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ body, editor, reviewer, outsider, password, admin }) => {
    const token = async (email: string) =>
      (await p.login({ collection: "staff", data: { email, password } })).token;
    const edit = await token(editor.email),
      review = await token(reviewer.email),
      outside = await token(outsider.email);
    const read = (suffix = "", jwt?: string) =>
      fetch(endpoint + suffix, { headers: jwt ? { Authorization: `JWT ${jwt}` } : {} });
    if (process.env.POLICY_EDITOR_TEST_ENABLED !== "true") {
      const draft = await mutateContent(p, editor, {
        action: "save",
        body,
        policy: policyFacts(editor.id),
      });
      const preview = await fetch(base + `/content-preview/${draft.id}`, {
        headers: { Authorization: `JWT ${edit}` },
        redirect: "manual",
      });
      assert.equal(preview.status, 404);
      console.log(
        "PASS default policy preview hidden for an authorized user with an existing draft",
      );
      return;
    }
    assert.equal((await read()).status, 403);
    assert.equal((await read("", outside)).status, 403);
    const blank = await read("", edit);
    assert.equal(blank.status, 200);
    assert.match(blank.headers.get("cache-control") || "", /no-store/);
    const empty = (await blank.json()) as PolicyEditorData;
    assert.equal(empty.draft, null);
    assert.equal(empty.policy.maxStayDays, null);
    assert.equal(empty.policy.verifiedBy, editor.id);
    assert.equal(empty.policy.lastVerifiedOn, empty.today);
    assert.ok(Array.isArray(empty.policyRows));
    assert.ok(empty.verifiers.every((v) => Object.keys(v).sort().join(",") === "id,name"));
    const draft = await mutateContent(p, editor, {
      action: "save",
      body: { ...body, blocks: [] },
      policy: policyFacts(editor.id),
    });
    for (const jwt of [edit, review]) {
      const response = await read(`?id=${draft.id}`, jwt);
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(text.includes("Private verification fixture"));
      assert.ok(!text.includes("@example.invalid"));
    }
    assert.equal((await read(`?id=${draft.id}`, outside)).status, 403);
    const page = (path: string, jwt?: string) =>
      fetch(base + path, {
        headers: jwt ? { Authorization: `JWT ${jwt}` } : {},
        redirect: "manual",
      });
    assert.equal((await page("/content-center?kind=immigration-policy", edit)).status, 200);
    assert.equal((await page("/content-center?kind=immigration-policy", outside)).status, 404);
    const preview = await page(`/content-preview/${draft.id}`, edit);
    assert.equal(preview.status, 200);
    assert.ok((await preview.text()).includes("Private verification fixture"));
    assert.equal((await page(`/content-preview/${draft.id}`, outside)).status, 404);

    assert.equal((await read("?id=0", edit)).status, 400);
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    assert.equal((await read(`?id=${draft.id}`, edit)).status, 403);
    console.log(
      "PASS HTTP policy form scope, private fields, minimal verifiers, no-store and disabled old JWT",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
