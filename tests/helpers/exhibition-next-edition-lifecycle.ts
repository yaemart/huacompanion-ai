import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import type { Payload } from "payload";
import type { ContentDraft, Staff } from "../../payload-types";
import type { ContentBody } from "../../src/lib/content-model";
import { shanghaiToday } from "../../src/lib/exhibitions";
import { resolveNextEdition } from "../../src/lib/exhibition-next-edition";
import { listPublished, mutateContent } from "../../src/server/content/service";
import { GET, POST } from "../../src/app/(frontend)/api/content-center/route";
import { databaseFingerprints } from "./database-fingerprints";

export async function assertExhibitionNextEditionLifecycle(
  p: Payload,
  fixture: ContentBody,
  admin: Staff,
) {
  const prefix = "edition-" + randomUUID();
  const ids: number[] = [];
  const people: number[] = [];
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await db.connect();
  const body = (
    name: string,
    patch: Partial<NonNullable<ContentBody["exhibition"]>> = {},
  ): ContentBody => ({
    ...fixture,
    contentKey: prefix + "-" + name,
    slug: prefix + "-" + name,
    title: "Fictional approved " + name,
    sources: fixture.sources.map((s) => ({ ...s, checkedAt: shanghaiToday() })),
    exhibition: {
      ...fixture.exhibition!,
      phases: [],
      startDate: "2020-01-01",
      endDate: "2020-01-03",
      status: "announced",
      nextEditionKey: "",
      verifiedAt: shanghaiToday(),
      ...patch,
    },
  });
  const save = async (data: ContentBody, id?: number) => {
    const current = id ? await p.findByID({ collection: "content-drafts", id }) : undefined;
    const row = await mutateContent(p, admin, {
      action: "save",
      body: data,
      id,
      revision: current?.revision,
    });
    if (!id) ids.push(row.id);
    return row;
  };
  const submit = (d: ContentDraft) =>
    mutateContent(p, admin, { action: "submit", id: d.id, revision: d.revision });
  const publish = (d: ContentDraft, reviewed = true) =>
    mutateContent(p, admin, {
      action: "publish",
      id: d.id,
      revision: d.revision,
      exhibitionReviewed: reviewed,
      overrideReason: "Fictional next-edition lifecycle verification",
    });
  const release = async (data: ContentBody, id?: number) =>
    publish(await submit(await save(data, id)));
  const unchanged = async (run: () => Promise<unknown>) => {
    const before = await databaseFingerprints(db);
    await run();
    assert.deepEqual(await databaseFingerprints(db), before);
  };
  const read = async () => {
    const live = await listPublished(p, "en");
    return { live, old: live.find((d) => d.contentKey === prefix + "-old")! };
  };
  const person = async (kinds: NonNullable<Staff["contentKinds"]>) => {
    const password = randomBytes(32).toString("base64url");
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        role: "editor",
        contentKinds: kinds,
        active: true,
        name: "Fictional edition editor",
        email: `${people.length}-${prefix}@example.invalid`,
        password,
      },
    });
    people.push(user.id);
    return (await p.login({ collection: "staff", data: { email: user.email, password } })).token!;
  };
  const post = (token: string, data: unknown) =>
    POST(
      new Request(process.env.APP_URL + "/api/content-center", {
        method: "POST",
        headers: {
          authorization: "JWT " + token,
          origin: process.env.APP_URL!,
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      }),
    );
  try {
    const invalid = await submit(
      await save(body("invalid", { nextEditionKey: prefix + "-missing" })),
    );
    await unchanged(() => assert.rejects(() => publish(invalid), /下一届/));
    const future = body("future", { startDate: "2090-01-01", endDate: "2090-01-03" });
    let target = await release(future);
    const oldBody = body("old", { nextEditionKey: future.contentKey });
    let old = await submit(await save(oldBody));
    await unchanged(() => assert.rejects(() => publish(old, false)));
    const editor = await person(["exhibition"]);
    const blocked = await person(["guide"]);
    await unchanged(async () => {
      assert.equal(
        (
          await post(editor, {
            action: "publish",
            id: old.id,
            revision: old.revision,
            exhibitionReviewed: true,
          })
        ).status,
        403,
      );
      assert.equal((await post(blocked, { action: "save", body: oldBody })).status, 403);
    });
    old = await publish(old);
    await unchanged(async () => {
      const { old, live } = await read();
      assert.equal(resolveNextEdition(old, live)?.contentKey, future.contentKey);
    });
    await save(
      {
        ...future,
        title: "PRIVATE_NEXT_DRAFT",
        exhibition: { ...future.exhibition!, status: "cancelled" },
      },
      target.id,
    );
    await unchanged(async () => {
      const { old, live } = await read();
      assert.equal(resolveNextEdition(old, live)?.title, future.title);
      const originalFind = p.find;
      p.find = (async (args: Parameters<Payload["find"]>[0]) => {
        const page = await originalFind.call(p, args);
        return args.collection === "content-drafts" && args.limit === 1000
          ? { ...page, docs: [], hasNextPage: true }
          : page;
      }) as Payload["find"];
      try {
        const response = await GET(
          new Request(process.env.APP_URL + "/api/content-center", {
            headers: { authorization: "JWT " + editor },
          }),
        );
        assert.equal(response.status, 200);
        const view = await response.json();
        assert.equal(view.drafts.length, 0, "simulate target beyond the bounded editable list");
        const choice = view.exhibitionChoices.find(
          (d: { contentKey: string }) => d.contentKey === future.contentKey,
        );
        assert.equal(
          choice.title,
          future.title,
          "choice comes from approved snapshot, not edited draft",
        );
        assert.equal(choice.blocks, undefined);
        assert.equal(choice.sources, undefined);
        assert.equal(choice.exhibition.transport, undefined);
      } finally {
        p.find = originalFind;
      }
      const response = await GET(
        new Request(process.env.APP_URL + "/api/content-center", {
          headers: { authorization: "JWT " + blocked },
        }),
      );
      assert.deepEqual((await response.json()).exhibitionChoices, []);
    });
    target = await release(
      { ...future, exhibition: { ...future.exhibition!, status: "cancelled" } },
      target.id,
    );
    await unchanged(async () => {
      const { old, live } = await read();
      assert.equal(resolveNextEdition(old, live), undefined);
    });
    target = await release(future, target.id);
    const row = await p.findByID({ collection: "content-drafts", id: target.id });
    await mutateContent(p, admin, {
      action: "unpublish",
      id: row.id,
      revision: row.revision,
      overrideReason: "Fictional target withdrawal",
    });
    await unchanged(async () => {
      const { old, live } = await read();
      assert.equal(resolveNextEdition(old, live), undefined);
    });
    const chinese = { ...future, locale: "zh" as const };
    await release(chinese);
    const wrongLanguage = await submit(
      await save(body("wrong-language", { nextEditionKey: future.contentKey })),
    );
    await unchanged(() => assert.rejects(() => publish(wrongLanguage), /下一届/));
    await unchanged(async () => {
      const { old, live } = await read();
      assert.equal(resolveNextEdition(old, live), undefined);
    });
    target = await release(
      {
        ...future,
        exhibition: {
          ...future.exhibition!,
          status: "pending",
          startDate: "",
          endDate: "",
          unresolved: "Fictional dates pending",
        },
      },
      target.id,
    );
    await unchanged(async () => {
      const { old, live } = await read();
      assert.equal(resolveNextEdition(old, live)?.exhibition?.startDate, "");
    });
    const wrongDates = await submit(
      await save(
        body("wrong-dates", {
          nextEditionKey: future.contentKey,
          startDate: "2092-01-01",
          endDate: "2092-01-03",
        }),
      ),
    );
    // Set the target back to confirmed dates before testing chronological rejection.
    target = await release(future, target.id);
    await unchanged(() => assert.rejects(() => publish(wrongDates), /下一届/));
    const versions = await p.findVersions({
      collection: "content-drafts",
      where: { parent: { equals: old.id } },
      limit: 100,
      sort: "-updatedAt",
    });
    const version = versions.docs.find(
      (d) =>
        (d.version.body as unknown as ContentBody).exhibition?.nextEditionKey === future.contentKey,
    )!;
    assert.ok(version);
    const staleRevision = old.revision;
    old = await release(
      { ...oldBody, exhibition: { ...oldBody.exhibition!, nextEditionKey: "" } },
      old.id,
    );
    await unchanged(() =>
      assert.rejects(
        () =>
          mutateContent(p, admin, {
            action: "save",
            body: oldBody,
            id: old.id,
            revision: staleRevision,
          }),
        /已经更新/,
      ),
    );
    old = await mutateContent(p, admin, {
      action: "restore",
      id: old.id,
      revision: old.revision,
      versionId: version.id,
    });
    old = await publish(await submit(old));
    const restored = await read();
    assert.equal(resolveNextEdition(restored.old, restored.live)?.contentKey, future.contentKey);
    const aBody = body("cycle-a", {
      status: "pending",
      startDate: "",
      endDate: "",
      unresolved: "Fictional cycle fixture",
    });
    const bBody = body("cycle-b", {
      status: "pending",
      startDate: "",
      endDate: "",
      unresolved: "Fictional cycle fixture",
    });
    let a = await release(aBody);
    let b = await release(bBody);
    a = await submit(
      await save(
        { ...aBody, exhibition: { ...aBody.exhibition!, nextEditionKey: bBody.contentKey } },
        a.id,
      ),
    );
    b = await submit(
      await save(
        { ...bBody, exhibition: { ...bBody.exhibition!, nextEditionKey: aBody.contentKey } },
        b.id,
      ),
    );
    const results = await Promise.allSettled([publish(a), publish(b)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.findIndex((r) => r.status === "rejected");
    const loser = rejected === 0 ? a : b;
    await unchanged(() => assert.rejects(() => publish(loser), /回环/));
    const reopenBody = body("reopen-a", {
      status: "pending",
      startDate: "",
      endDate: "",
      unresolved: "Fictional withdrawn source",
    });
    let reopen = await release(reopenBody);
    const backBody = body("reopen-b", {
      status: "pending",
      startDate: "",
      endDate: "",
      unresolved: "Fictional back reference",
      nextEditionKey: reopenBody.contentKey,
    });
    await release(backBody);
    await mutateContent(p, admin, {
      action: "unpublish",
      id: reopen.id,
      revision: reopen.revision,
      overrideReason: "Fictional withdrawn-cycle reproduction",
    });
    reopen = await submit(
      await save(
        {
          ...reopenBody,
          exhibition: { ...reopenBody.exhibition!, nextEditionKey: backBody.contentKey },
        },
        reopen.id,
      ),
    );
    await unchanged(async () => {
      await assert.rejects(() => publish(reopen), /回环/);
      assert.ok(
        !(await listPublished(p, "en")).some((d) => d.contentKey === reopenBody.contentKey),
      );
      const snapshots = await p.find({
        collection: "content-published",
        where: { draftId: { equals: reopen.id } },
        limit: 1,
      });
      assert.equal(
        snapshots.docs[0].active,
        false,
        "failed republication keeps the source withdrawn",
      );
    });
    console.log(
      "PASS next-edition lifecycle: publish guards, permissions, approved choices beyond draft truncation, draft isolation, withdrawal, unknown dates, restore and concurrent cycle rollback",
    );
  } finally {
    for (const id of ids) {
      const row = await p.findByID({ collection: "content-drafts", id });
      await mutateContent(p, admin, {
        action: "unpublish",
        id,
        revision: row.revision,
        overrideReason: "Fictional next-edition cleanup",
      });
    }
    if (people.length) await p.delete({ collection: "staff", where: { id: { in: people } } });
    await db.end();
  }
}
