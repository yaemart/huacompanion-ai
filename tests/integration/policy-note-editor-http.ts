import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { policyFixture } from "../helpers/policy-workflow-fixture";
import { mutateSharedPolicyFacts } from "../../src/server/immigration/shared-facts-service";
import { readSharedPolicyNote } from "../../src/server/immigration/shared-notes-service";
import { relationID } from "../../src/cms/access";
const base = process.env.APP_URL || "";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c[56]_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (url.hostname !== "127.0.0.1" || (!clone && !ci) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Disposable C5 HTTP clone or CI only");
const endpoint = base + "/api/content-center/policy-notes";
const page = base + "/content-center/policy-facts";
if (process.env.VISA_CHECKER_ENABLED !== "true") {
  const hidden = await fetch(endpoint, { method: "POST" });
  assert.equal(hidden.status, 404);
  assert.match(hidden.headers.get("cache-control") || "", /no-store/);
  assert.equal((await fetch(page + "?id=1&locale=zh", { redirect: "manual" })).status, 404);
  console.log("PASS note editor and mutations feature-off 404/no-store");
  process.exit(0);
}
const p = await getPayload({ config });
try {
  await policyFixture(
    p,
    async ({ key, body: legacyBody, editor, reviewer, outsider, password, admin }) => {
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
      const read = (suffix: string, jwt?: string) =>
        fetch(page + suffix, { headers: headers(jwt), redirect: "manual" });
      assert.equal((await read("?id=1&locale=zh")).status, 307);
      assert.equal((await read("?id=1&locale=zh", outside)).status, 404);
      for (const suffix of [
        "?locale=zh",
        "?id=0&locale=zh",
        "?id=NaN&locale=en",
        "?id=1&locale=fr",
        "?id=999999999&locale=zh",
      ])
        assert.equal((await read(suffix, edit)).status, 404, suffix);
      assert.equal((await post({})).status, 403);
      assert.equal((await post({}, edit, "https://example.invalid")).status, 403);
      for (const bad of [null, {}, { groupId: 1, locale: "fr", action: "save" }])
        assert.equal((await post(bad, edit)).status, 400);
      const fd = await mutateSharedPolicyFacts(p, editor, {
        action: "save",
        contentKey: key,
        facts: {
          countryCode: "DE",
          countryNameEn: "Fictional HTTP DEMO",
          countryNameZh: "虚构演示",
          policyType: "unilateral",
          internalNotes: "PRIVATE HTTP NOTE",
        },
      });
      const groupId = Number(relationID(fd.group));
      const entry = await fetch(base + "/content-center?kind=immigration-policy", {
        headers: headers(edit),
        redirect: "manual",
      });
      assert.equal(entry.status, 307);
      assert.equal(entry.headers.get("location"), "/content-center/policy-facts");
      const legacy = await fetch(base + "/api/content-center", {
        method: "POST",
        headers: { ...headers(edit), Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          body: legacyBody,
        }),
      });
      assert.equal(legacy.status, 409);
      assert.equal(
        (await p.count({ collection: "content-drafts", where: { contentKey: { equals: key } } }))
          .totalDocs,
        0,
      );
      for (const locale of ["zh", "en"]) {
        const html = await read(`?id=${groupId}&locale=${locale}`, edit);
        assert.equal(html.status, 200);
        const text = (await html.text()).replace(/<!--.*?-->/g, "");
        assert.match(text, locale === "zh" ? /中文公开说明/ : /英文公开说明/);
        assert.match(text, /尚无已发布事实/);
        assert.ok(!text.includes("PRIVATE HTTP NOTE"));
      }
      const input = {
        action: "save",
        groupId,
        locale: "zh",
        factVersion: null,
        body: { title: "虚构演示", slug: key, publicNotes: "原文 30天" },
      };
      assert.equal((await post(input, outside)).status, 403);
      assert.equal((await post(input, review)).status, 403);
      assert.equal((await post({ ...input, factVersion: 123 }, edit)).status, 409);
      const saved = await post(input, edit);
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { ok: true });
      assert.match(saved.headers.get("cache-control") || "", /private.*no-store/);
      assert.equal((await post(input, edit)).status, 409);
      const desk = await readSharedPolicyNote(p, editor, groupId, "zh");
      assert.equal(desk.draft?.publicNotes, "原文 30天");
      assert.equal(
        (await post({ ...input, action: "submit", revision: desk.draft!.revision }, edit)).status,
        409,
      );
      assert.equal(
        (
          await post(
            { ...input, locale: "en", body: { ...input.body, internalNotes: "SECRET" } },
            edit,
          )
        ).status,
        400,
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
      assert.equal(
        (
          await fetch(endpoint, {
            method: "POST",
            headers: { ...headers(edit), Origin: base },
            body: "{",
          })
        ).status,
        400,
      );
      await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
      assert.equal((await post({ ...input, revision: desk.draft!.revision }, edit)).status, 403);
      assert.equal((await read(`?id=${groupId}&locale=zh`, edit)).status, 307);
      console.log(
        "PASS note HTTP language SSR, missing IDs, roles/fresh revoke, Origin, no-store, JSON/size, stale fact/revision and no premature submit",
      );
    },
  );
} finally {
  await p.destroy();
}
process.exit(0);
