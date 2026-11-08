import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent } from "../../src/server/content/service";
import { readPolicyEditor } from "../../src/server/immigration/editor";
import { seedPolicyDrafts } from "../../src/server/immigration/seed";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
if (process.env.APP_ENV !== "local") throw Error("Local isolated test only");
const p = await getPayload({ config });
const testEnvironment: Record<string, string | undefined> = process.env;
try {
  await policyFixture(p, async ({ key, body, editor, reviewer }) => {
    const fields = policyFacts(editor.id);
    const seeds = [
      {
        contentKey: `${key}-valid-seed`,
        locale: "en",
        title: "Fictional seed",
        policy: { countryCode: "DE" },
      },
      {
        contentKey: `${key}-invalid-seed`,
        locale: "en",
        title: "Fictional seed",
        policy: { countryCode: "ZZ" },
      },
    ];
    await assert.rejects(() => seedPolicyDrafts(p, editor, seeds), /国家/);
    await assert.rejects(() => seedPolicyDrafts(p, editor, seeds, { apply: true }), /国家/);
    assert.equal(
      (
        await p.count({
          collection: "content-drafts",
          where: { contentKey: { equals: `${key}-valid-seed` } },
        })
      ).totalDocs,
      0,
    );
    await assert.rejects(
      () =>
        mutateContent(p, editor, {
          action: "save",
          body,
          policy: { ...fields, countryCode: "ZZ" },
        }),
      /国家/,
    );
    assert.equal(
      (await p.count({ collection: "content-drafts", where: { contentKey: { equals: key } } }))
        .totalDocs,
      0,
    );
    assert.equal(
      (
        await p.count({
          collection: "immigration-policies",
          where: { policyKey: { equals: `${key}:en` } },
        })
      ).totalDocs,
      0,
    );
    await assert.rejects(
      () =>
        mutateContent(p, editor, {
          action: "save",
          body,
          policy: { ...fields, countryCode: "ZZ", allowFictional: true },
        }),
      /不允许/,
    );
    const countries = (await readPolicyEditor(p, editor)).countries;
    assert.equal(countries.length, 253);
    assert.ok(countries.some((c) => c.code === "XY"));
    let draft = await mutateContent(p, editor, { action: "save", body, policy: fields });
    const old = (
      await p.findVersions({
        collection: "content-drafts",
        where: { parent: { equals: draft.id } },
        sort: "createdAt",
        limit: 1,
      })
    ).docs[0];
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: { ...fields, countryCode: "DE", countryNameEn: "Germany", countryNameZh: "德国" },
    });
    const before = await p.findByID({ collection: "content-drafts", id: draft.id, depth: 0 });
    for (const duplicate of [body, { ...body, contentKey: `${key}-collision` }]) {
      await assert.rejects(
        () => mutateContent(p, editor, { action: "save", body: duplicate, policy: fields }),
        (e) =>
          e instanceof Error &&
          /标识.*已存在/.test(e.message) &&
          (e as { status?: number }).status === 409,
      );
      assert.deepEqual(
        await p.findByID({ collection: "content-drafts", id: draft.id, depth: 0 }),
        before,
      );
    }
    assert.equal(
      (
        await p.count({
          collection: "content-drafts",
          where: { contentKey: { equals: `${key}-collision` } },
        })
      ).totalDocs,
      0,
    );
    const orphan = { ...body, contentKey: `${key}-orphan`, slug: `${key}-orphan` };
    await p.create({
      collection: "immigration-policies",
      data: { policyKey: `${key}-orphan:en`, revision: 1, status: "draft" },
    });
    await assert.rejects(
      () => mutateContent(p, editor, { action: "save", body: orphan, policy: fields }),
      /标识.*已存在/,
    );
    const oldNode = testEnvironment.NODE_ENV,
      oldApp = process.env.APP_ENV;
    try {
      testEnvironment.NODE_ENV = "production";
      for (const appEnv of ["local", "trial", "production"]) {
        process.env.APP_ENV = appEnv;
        const strict = await readPolicyEditor(p, editor);
        assert.equal(strict.countries.length, 249);
        assert.ok(!strict.countries.some((c) => c.code === "XY"));
        await assert.rejects(
          () =>
            mutateContent(p, editor, {
              action: "save",
              id: draft.id,
              revision: draft.revision,
              body: draft.body,
              policy: fields,
            }),
          /国家/,
        );
        await assert.rejects(
          () =>
            mutateContent(p, editor, {
              action: "restore",
              id: draft.id,
              revision: draft.revision,
              versionId: old.id,
            }),
          /国家/,
        );
        assert.deepEqual(
          await p.findByID({ collection: "content-drafts", id: draft.id, depth: 0 }),
          before,
        );
      }
    } finally {
      if (oldNode === undefined) delete testEnvironment.NODE_ENV;
      else testEnvironment.NODE_ENV = oldNode;
      if (oldApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = oldApp;
    }
    // Existing ISO draft is editable without resubmitting country; labels are not silently normalized.
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: { publicNotes: "Fictional integration only" },
    });
    assert.equal((await readPolicyEditor(p, editor, draft.id)).policy.countryCode, "DE");
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: fields,
    });
    draft = await mutateContent(p, editor, {
      action: "submit",
      id: draft.id,
      revision: draft.revision,
    });
    try {
      testEnvironment.NODE_ENV = "production";
      await assert.rejects(
        () =>
          mutateContent(p, reviewer, {
            action: "publish",
            id: draft.id,
            revision: draft.revision,
            policyReviewed: true,
          }),
        /国家/,
      );
      assert.equal(
        (
          await p.count({
            collection: "content-published",
            where: { draftId: { equals: draft.id } },
          })
        ).totalDocs,
        0,
      );
      assert.equal(
        (await p.findByID({ collection: "content-drafts", id: draft.id })).reviewState,
        "review",
      );
    } finally {
      if (oldNode === undefined) delete testEnvironment.NODE_ENV;
      else testEnvironment.NODE_ENV = oldNode;
    }
    await mutateContent(p, reviewer, {
      action: "publish",
      id: draft.id,
      revision: draft.revision,
      policyReviewed: true,
    });
    console.log(
      "PASS country save/restore/publish guards, server environment only, ISO edits preserved, duplicate identity/URL/orphan no overwrite, local fictional review allowed",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
