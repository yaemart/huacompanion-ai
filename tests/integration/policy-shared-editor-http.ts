import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { policyFixture } from "../helpers/policy-workflow-fixture";
const base = process.env.APP_URL || "";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c4_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (url.hostname !== "127.0.0.1" || (!clone && !ci) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Disposable shared-editor HTTP clone or CI only");
const endpoint = base + "/api/content-center/policy-facts";
const page = base + "/content-center/policy-facts";
if (process.env.VISA_CHECKER_ENABLED !== "true") {
  assert.equal((await fetch(endpoint, { method: "POST" })).status, 404);
  assert.equal((await fetch(page, { redirect: "manual" })).status, 404);
  console.log("PASS shared facts editor and mutations hidden by default");
  process.exit(0);
}
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, editor, reviewer, outsider, password, admin }) => {
    const token = async (email: string) =>
      (await p.login({ collection: "staff", data: { email, password } })).token;
    const edit = await token(editor.email),
      review = await token(reviewer.email),
      outside = await token(outsider.email);
    const headers = (jwt?: string) => (jwt ? { Authorization: `JWT ${jwt}` } : undefined);
    const post = (body: unknown, jwt?: string, origin = base) =>
      fetch(endpoint, {
        method: "POST",
        headers: { ...headers(jwt), Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const read = (jwt?: string, suffix = "") =>
      fetch(page + suffix, { headers: headers(jwt), redirect: "manual" });
    assert.equal((await read()).status, 307);
    assert.equal((await read(outside)).status, 404);
    assert.equal((await read(edit)).status, 200);
    assert.equal((await read(review)).status, 200);
    assert.equal((await post({ action: "save" })).status, 403);
    assert.equal((await post({ action: "save" }, edit, "https://example.invalid")).status, 403);
    assert.equal((await post(null, edit)).status, 400);
    assert.equal(
      (await post({ action: "save", contentKey: key, facts: { countryCode: "DE" } }, outside))
        .status,
      403,
    );
    assert.equal(
      (await post({ action: "save", contentKey: key, facts: { countryCode: "DE" } }, review))
        .status,
      403,
    );
    for (const malformed of [
      { verifiedBy: {} },
      { policyType: "__proto__" },
      { policyType: "constructor" },
      { policyType: "unknown-policy" },
    ]) {
      const invalid = await post(
        { action: "save", contentKey: key + "-bad", facts: { countryCode: "DE", ...malformed } },
        edit,
      );
      assert.equal(invalid.status, 400);
      assert.equal(
        (
          await p.count({
            collection: "policy-groups",
            where: { contentKey: { equals: key + "-bad" } },
          })
        ).totalDocs,
        0,
      );
    }
    const saved = await post(
      {
        action: "save",
        contentKey: key,
        facts: {
          countryCode: "DE",
          countryNameZh: "虚构HTTP",
          internalNotes: "PRIVATE HTTP FIXTURE",
        },
      },
      edit,
    );
    assert.equal(saved.status, 200);
    assert.match(saved.headers.get("cache-control") || "", /private.*no-store/);
    const result = await saved.json();
    assert.equal(result.draft.revision, 1);
    assert.equal(result.draft.reviewState, "draft");
    assert.equal(result.draft.facts.internalNotes, "PRIVATE HTTP FIXTURE");
    const next = await post(
      {
        action: "save",
        groupId: result.groupId,
        revision: result.draft.revision,
        facts: { internalNotes: "PRIVATE HTTP FIXTURE · autosave" },
      },
      edit,
    );
    assert.equal(next.status, 200);
    assert.equal((await next.json()).draft.revision, 2);
    assert.equal(
      (
        await post(
          { action: "save", groupId: result.groupId, revision: result.draft.revision, facts: {} },
          edit,
        )
      ).status,
      409,
    );
    const postNote = (revision: number | undefined, jwt: string | undefined) =>
      fetch(base + "/api/content-center/policy-notes", {
        method: "POST",
        headers: { ...headers(jwt), Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          groupId: result.groupId,
          factVersion: null,
          locale: "zh",
          revision,
          body: { title: "虚构说明", slug: key, publicNotes: "Fictional autosave note" },
        }),
      });
    assert.equal((await postNote(undefined, review)).status, 403);
    const note = await postNote(undefined, edit);
    assert.equal(note.status, 200);
    assert.match(note.headers.get("cache-control") || "", /private.*no-store/);
    const savedNote = (await note.json()).draft;
    assert.equal(savedNote.revision, 1);
    assert.equal(savedNote.reviewState, "draft");
    assert.equal((await postNote(savedNote.revision, edit)).status, 200);
    assert.equal((await postNote(savedNote.revision, edit)).status, 409);
    const html = await read(edit, `?id=${result.groupId}`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /PRIVATE HTTP FIXTURE/);
    const denied = await read(outside, `?id=${result.groupId}`);
    assert.equal(denied.status, 404);
    assert.ok(!(await denied.text()).includes("PRIVATE HTTP FIXTURE"));
    assert.equal(
      (await post({ action: "save", groupId: result.groupId, revision: 0, facts: {} }, edit))
        .status,
      409,
    );
    assert.equal(
      (
        await fetch(endpoint, {
          method: "POST",
          headers: { ...headers(edit), Origin: base },
          body: "x".repeat(150001),
        })
      ).status,
      413,
    );
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    assert.equal(
      (await post({ action: "save", groupId: result.groupId, revision: 2, facts: {} }, edit))
        .status,
      403,
    );
    console.log(
      "PASS shared editor HTTP auth, board scope, no-store, fresh roles, Origin, size, JSON and revision boundaries",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
