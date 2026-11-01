import "dotenv/config";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { seedPolicyDrafts } from "../../src/server/immigration/seed";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
import { listPublicPolicies } from "../../src/server/immigration/public";
import type { ContentBody } from "../../src/lib/content-model";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, editor, reviewer, outsider, admin }) => {
    const entry = (suffix: string) => ({
      contentKey: `${key}-${suffix}`,
      locale: "en",
      title: "Unverified fictional seed",
      policy: { countryNameEn: "Unverified fixture", internalNotes: "Private seed fixture" },
    });
    const row = entry("seed");
    const identity = `${row.contentKey}:en`;
    const find = (contentKey: string) =>
      p.find({ collection: "content-drafts", where: { identity: { equals: `${contentKey}:en` } } });
    const preview = await seedPolicyDrafts(p, editor, [row]);
    assert.deepEqual(preview, { created: [], skipped: [], pending: [identity] });
    assert.equal((await find(row.contentKey)).totalDocs, 0);
    assert.deepEqual(await seedPolicyDrafts(p, editor, [row], { apply: true }), {
      created: [identity],
      skipped: [],
      pending: [],
    });
    let draft = (await find(row.contentKey)).docs[0];
    assert.equal(draft.reviewState, "draft");
    assert.equal(draft.everPublished, false);
    assert.equal(
      (await p.count({ collection: "content-published", where: { draftId: { equals: draft.id } } }))
        .totalDocs,
      0,
    );
    const record = (
      await p.find({
        collection: "immigration-policies",
        where: { policyKey: { equals: identity } },
      })
    ).docs[0];
    assert.equal(record.status, "draft");
    assert.equal(record.verifiedBy, null);
    assert.equal(record.lastVerifiedOn, null);
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: { countryNameEn: "Human edit retained", maxStayDays: 9 },
    });
    const versions = await p.countVersions({
      collection: "content-drafts",
      where: { parent: { equals: draft.id } },
    });
    const before = (await find(row.contentKey)).docs[0];
    assert.deepEqual(await seedPolicyDrafts(p, editor, [row], { apply: true }), {
      created: [],
      skipped: [identity],
      pending: [],
    });
    assert.deepEqual((await find(row.contentKey)).docs[0], before);
    assert.equal(
      (
        await p.countVersions({
          collection: "content-drafts",
          where: { parent: { equals: draft.id } },
        })
      ).totalDocs,
      versions.totalDocs,
    );
    const updated = await p.findByID({ collection: "immigration-policies", id: record.id });
    assert.equal(updated.countryNameEn, "Human edit retained");
    assert.equal(updated.maxStayDays, 9);
    const pair = await Promise.all([
      seedPolicyDrafts(p, editor, [entry("race")], { apply: true }),
      seedPolicyDrafts(p, editor, [entry("race")], { apply: true }),
    ]);
    assert.equal(
      pair.reduce((n, result) => n + result.created.length, 0),
      1,
    );
    assert.equal(
      pair.reduce((n, result) => n + result.skipped.length, 0),
      1,
    );
    assert.equal((await find(entry("race").contentKey)).totalDocs, 1);
    for (const user of [null, reviewer, outsider])
      await assert.rejects(() => seedPolicyDrafts(p, user, [row], { apply: true }), {
        status: 403,
      });
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    await assert.rejects(() => seedPolicyDrafts(p, editor, [row]), { status: 403 });
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: true } });
    await assert.rejects(() =>
      seedPolicyDrafts(p, editor, [entry("valid"), { ...row, id: 99 }], { apply: true }),
    );
    assert.equal((await find(entry("valid").contentKey)).totalDocs, 0);
    for (const contentKey of [undefined, null, 123]) {
      await assert.rejects(() =>
        seedPolicyDrafts(p, editor, [entry("strict-key"), { ...entry("invalid"), contentKey }], {
          apply: true,
        }),
      );
      assert.equal((await find(entry("strict-key").contentKey)).totalDocs, 0);
    }
    const orphan = entry("orphan");
    await p.create({
      collection: "immigration-policies",
      data: { policyKey: `${orphan.contentKey}:en`, status: "draft", revision: 1 },
    });
    assert.equal((await seedPolicyDrafts(p, editor, [orphan], { apply: true })).skipped.length, 1);
    assert.equal((await find(orphan.contentKey)).totalDocs, 0);
    const broken = new Proxy(p, {
      get(target, name, receiver) {
        if (name !== "create") return Reflect.get(target, name, receiver);
        return (async (args: Parameters<typeof p.create>[0]) => {
          if (args.collection === "content-drafts") throw Error("Injected seed draft failure");
          return p.create(args);
        }) as typeof p.create;
      },
    });
    await assert.rejects(
      () => seedPolicyDrafts(broken, editor, [entry("broken")], { apply: true }),
      /Injected/,
    );
    assert.equal(
      (
        await p.count({
          collection: "immigration-policies",
          where: { policyKey: { equals: `${entry("broken").contentKey}:en` } },
        })
      ).totalDocs,
      0,
    );
    console.log(
      "PASS seed preview, draft-only creation, human edits retained, concurrency, authorization and rollback",
    );
    const dir = await mkdtemp(join(tmpdir(), "hua-policy-seed-"));
    try {
      const file = join(dir, "seeds.json");
      const cli = entry("cli");
      await writeFile(file, JSON.stringify([cli]));
      const invalidDB = new URL(process.env.DATABASE_URL!);
      invalidDB.username = `missing_seed_role_${key.slice(-12)}`;
      invalidDB.password = "DoNotLogInitializationSecret";
      await assert.rejects(
        () =>
          promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/seed-policies.ts", "--file", file],
            { env: { ...process.env, DATABASE_URL: invalidDB.toString() }, timeout: 10000 },
          ),
        (error: unknown) => {
          const failure = error as { code: number; stderr: string; stdout: string };
          assert.equal(failure.code, 1);
          assert.ok(!(failure.stderr + failure.stdout).includes("DoNotLogInitializationSecret"));
          return true;
        },
      );
      const run = (...args: string[]) =>
        promisify(execFile)(process.execPath, [
          "--import",
          "tsx",
          "scripts/seed-policies.ts",
          "--file",
          file,
          ...args,
        ]);
      await writeFile(file, '[{"private":"DoNotLogSeedSecret"');
      await assert.rejects(
        () => run("--apply"),
        (error: unknown) => {
          const failure = error as { code: number; stderr: string };
          assert.equal(failure.code, 1);
          assert.ok(!failure.stderr.includes("DoNotLogSeedSecret"));
          return true;
        },
      );
      await writeFile(file, JSON.stringify([cli]));
      await run();
      assert.equal((await find(cli.contentKey)).totalDocs, 0);
      await run("--apply");
      await run("--apply");
      const created = (await find(cli.contentKey)).docs;
      assert.equal(created.length, 1);
      assert.equal(created[0].reviewState, "draft");
      assert.equal(
        (
          await p.count({
            collection: "content-published",
            where: { draftId: { equals: created[0].id } },
          })
        ).totalDocs,
        0,
      );
      console.log("PASS real seed CLI preview/apply/rerun without publication");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  await policyFixture(p, async ({ key, body, editor, reviewer, outsider }) => {
    let draft = await mutateContent(p, editor, {
      action: "save",
      body,
      policy: policyFacts(editor.id),
    });
    const step = async (action: string, extra: object = {}) => {
      draft = await mutateContent(p, action === "submit" ? editor : reviewer, {
        action,
        id: draft.id,
        revision: draft.revision,
        ...extra,
      });
    };
    const oldFlag = process.env.VISA_CHECKER_ENABLED;
    const failedDB = new Proxy(p, {
      get(target, name, receiver) {
        if (name !== "find") return Reflect.get(target, name, receiver);
        return async () => {
          throw Error("Injected policy reader DB failure");
        };
      },
    });
    try {
      process.env.VISA_CHECKER_ENABLED = "false";
      assert.deepEqual(await listPublicPolicies(failedDB, "en"), []);
      process.env.VISA_CHECKER_ENABLED = "true";
      assert.deepEqual(await listPublicPolicies(failedDB, "fr"), []);
      await assert.rejects(() => listPublicPolicies(failedDB, "en"), /Injected/);
      assert.deepEqual(await listPublicPolicies(p, "en"), []);
      await step("submit");
      assert.deepEqual(await listPublicPolicies(p, "en"), []);
      await step("publish", { policyReviewed: true });
      assert.deepEqual(
        await seedPolicyDrafts(
          p,
          editor,
          [
            {
              contentKey: key,
              locale: "en",
              title: "Do not overwrite published work",
              policy: { countryNameEn: "Seed overwrite attempt" },
            },
          ],
          { apply: true },
        ),
        { created: [], skipped: [`${key}:en`], pending: [] },
      );
      const expected = [
        {
          countryCode: "XY",
          countryNameEn: "Fictional country",
          countryNameZh: "虚构国家",
          policyType: "other",
          maxStayDays: 3,
          validFrom: "2026-01-01",
          validUntil: null,
          portsAndRegions: ["Fictional condition"],
          officialSourceUrl: "https://example.invalid/policy",
          lastVerifiedOn: "2026-01-01",
          publicNotes: "Fictional policy for testing only",
        },
      ];
      assert.deepEqual(await listPublicPolicies(p, "en"), expected);
      assert.deepEqual(await listPublicPolicies(p, "zh"), []);
      assert.ok(!(await listPublished(p, "en")).some((row) => row.kind === "immigration-policy"));
      await assert.rejects(() =>
        p.find({ collection: "immigration-policies", overrideAccess: false, user: outsider }),
      );
      const snapshot = (
        await p.find({ collection: "content-published", where: { draftId: { equals: draft.id } } })
      ).docs[0];
      const snapshotBody = snapshot.body as unknown as ContentBody;
      await p.update({
        collection: "content-published",
        id: snapshot.id,
        data: {
          body: {
            ...snapshotBody,
            policy: {
              ...snapshotBody.policy,
              verifiedBy: editor.id,
              internalNotes: "Snapshot secret",
              email: "private@example.invalid",
            },
            policyRef: { id: 99999, revision: 88 },
          },
        },
      });
      assert.deepEqual(await listPublicPolicies(p, "en"), expected);
      const copy = await listPublicPolicies(p, "en");
      copy[0].portsAndRegions.push("Changed caller copy");
      assert.deepEqual(await listPublicPolicies(p, "en"), expected);
      draft = await mutateContent(p, editor, {
        action: "save",
        id: draft.id,
        revision: draft.revision,
        body,
        policy: { ...policyFacts(editor.id), maxStayDays: 9 },
      });
      assert.deepEqual(await listPublicPolicies(p, "en"), expected);
      await p.update({
        collection: "content-published",
        id: snapshot.id,
        data: {
          body: {
            ...snapshotBody,
            policy: { ...snapshotBody.policy, countryCode: "Invalid private fixture" },
          },
        },
      });
      assert.deepEqual(await listPublicPolicies(p, "en"), []);
      await p.update({
        collection: "content-published",
        id: snapshot.id,
        data: { body: snapshot.body },
      });
      const zhBody = { ...body, locale: "zh" };
      let zhDraft = await mutateContent(p, editor, {
        action: "save",
        body: zhBody,
        policy: policyFacts(editor.id),
      });
      zhDraft = await mutateContent(p, editor, {
        action: "submit",
        id: zhDraft.id,
        revision: zhDraft.revision,
      });
      await mutateContent(p, reviewer, {
        action: "publish",
        id: zhDraft.id,
        revision: zhDraft.revision,
        policyReviewed: true,
      });
      assert.deepEqual(await listPublicPolicies(p, "zh"), expected);
      assert.deepEqual(await listPublicPolicies(p, "en"), expected);
      await step("unpublish");
      assert.deepEqual(await listPublicPolicies(p, "en"), []);
      console.log(
        "PASS published-only projection, immutable snapshot, language, private-field removal and fail-closed validation",
      );
      const extraPrefix = `${key}-projection-size`;
      try {
        for (let offset = 0; offset < 201; offset += 10)
          await Promise.all(
            Array.from({ length: Math.min(10, 201 - offset) }, (_, index) => {
              const n = offset + index;
              return p.create({
                collection: "content-published",
                data: {
                  draftId: -(n + 1),
                  routeKey: `${extraPrefix}-${n}`,
                  active: true,
                  revision: 1,
                  publishedBy: reviewer.id,
                  publishedAt: new Date().toISOString(),
                  body: snapshot.body,
                },
              });
            }),
          );
        assert.equal((await listPublicPolicies(p, "en")).length, 201);
      } finally {
        await p.delete({
          collection: "content-published",
          where: { routeKey: { like: extraPrefix } },
        });
      }
      console.log("PASS complete projection of more than 200 formal snapshots");
    } finally {
      if (oldFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
      else process.env.VISA_CHECKER_ENABLED = oldFlag;
    }
  });
} finally {
  await p.destroy();
}
process.exit(0);
