import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Payload } from "payload";
import type { ContentDraft, Staff } from "../../payload-types";
import type { ContentBody } from "../../src/lib/content-model";
import { POST, GET } from "../../src/app/(frontend)/api/content-center/route";
import { listPublished, mutateContent } from "../../src/server/content/service";
import { databaseFingerprints } from "./database-fingerprints";

export async function assertExhibitionVisitorLifecycle(p: Payload, fixture: ContentBody) {
  const key = "visitor-" + randomUUID(),
    people: number[] = [],
    drafts: number[] = [];
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await db.connect();
  const person = async (
    role: "admin" | "editor",
    contentKinds: NonNullable<Staff["contentKinds"]> = ["exhibition"],
  ) => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        role,
        contentKinds,
        name: "Fictional visitor fixture",
        email: `${people.length}-${key}@example.invalid`,
        password: key,
        active: true,
      },
    });
    people.push(user.id);
    const login = await p.login({
      collection: "staff",
      data: { email: user.email, password: key },
    });
    return { user, token: login.token! };
  };
  const origin = process.env.APP_URL!;
  const post = (token: string, input: unknown, from = origin) =>
    POST(
      new Request(origin + "/api/content-center", {
        method: "POST",
        headers: {
          authorization: "JWT " + token,
          origin: from,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    );
  const unchanged = async (run: () => Promise<unknown>) => {
    const before = await databaseFingerprints(db);
    await run();
    assert.deepEqual(await databaseFingerprints(db), before);
  };
  let admin: Awaited<ReturnType<typeof person>> | undefined;
  try {
    admin = await person("admin");
    const editor = await person("editor"),
      blocked = await person("editor", ["guide"]);
    const body: ContentBody = {
      ...fixture,
      contentKey: key,
      slug: key,
      title: "Fictional visitor lifecycle",
      exhibition: {
        ...fixture.exhibition!,
        phases: [
          {
            name: "First phase",
            startDate: "2090-01-31",
            endDate: "2090-02-01",
            theme: "Fictional theme",
          },
        ],
        transport: "Fictional transit",
        buyerRegistration: "Fictional buyer entry",
        stayAreas: "Fictional lodging",
        firstVisitTips: "Fictional tip",
      },
    };
    const command = { action: "save", body };
    await unchanged(async () => {
      assert.equal((await post("", command)).status, 403);
      assert.equal((await post(blocked.token, command)).status, 403);
      assert.equal((await post(editor.token, command, "https://foreign.invalid")).status, 403);
    });
    let response = await post(editor.token, command);
    assert.equal(response.status, 200);
    let draft = (await response.json()) as ContentDraft;
    drafts.push(draft.id);
    assert.equal((draft.body as unknown as ContentBody).exhibition?.transport, "Fictional transit");
    assert.equal(
      (await listPublished(p, "en")).some((row) => row.contentKey === key),
      false,
    );
    const savedRevision = draft.revision;
    response = await post(editor.token, {
      action: "submit",
      id: draft.id,
      revision: draft.revision,
    });
    assert.equal(response.status, 200);
    draft = (await response.json()) as ContentDraft;
    const publication = {
      action: "publish",
      id: draft.id,
      revision: draft.revision,
      overrideReason: "Fictional local review",
    };
    await unchanged(async () => {
      assert.equal(
        (await post(editor.token, { ...publication, exhibitionReviewed: true })).status,
        403,
      );
      assert.equal((await post(admin!.token, publication)).status, 400);
    });
    response = await post(admin.token, { ...publication, exhibitionReviewed: true });
    assert.equal(response.status, 200);
    draft = (await response.json()) as ContentDraft;
    const live = () =>
      listPublished(p, "en").then((rows) => rows.find((row) => row.contentKey === key)!);
    assert.equal((await live()).exhibition?.phases?.[0].theme, "Fictional theme");
    response = await post(editor.token, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: {
        ...body,
        exhibition: { ...body.exhibition!, transport: "Unpublished transit revision" },
      },
    });
    assert.equal(response.status, 200);
    draft = (await response.json()) as ContentDraft;
    assert.equal(
      (await live()).exhibition?.transport,
      "Fictional transit",
      "editing must not replace the reviewed snapshot",
    );
    await unchanged(async () => {
      assert.equal(
        (await post(editor.token, { action: "save", id: draft.id, revision: savedRevision, body }))
          .status,
        409,
      );
      const preview = await GET(
        new Request(origin + "/api/content-center?draft=" + draft.id, {
          headers: { authorization: "JWT " + editor.token },
        }),
      );
      assert.equal(preview.status, 200);
      const data = await preview.json();
      assert.equal(
        data.drafts.find((row: { id: number }) => row.id === draft.id).body.exhibition.transport,
        "Unpublished transit revision",
      );
    });
    const versions = await p.findVersions({
      collection: "content-drafts",
      where: { parent: { equals: draft.id } },
      limit: 30,
    });
    const original = versions.docs.find(
      (v) =>
        (v.version.body as unknown as ContentBody)?.exhibition?.transport === "Fictional transit",
    );
    assert.ok(original);
    draft = await mutateContent(p, admin.user, {
      action: "restore",
      id: draft.id,
      revision: draft.revision,
      versionId: original.id,
    });
    assert.equal((draft.body as unknown as ContentBody).exhibition?.transport, "Fictional transit");
    assert.equal(
      (draft.body as unknown as ContentBody).exhibition?.phases?.[0].name,
      "First phase",
    );
    for (const [suffix, patch] of [
      ["missing-source", { sources: [] }],
      [
        "blank-phase",
        {
          exhibition: {
            ...body.exhibition!,
            phases: [{ name: "", theme: "", startDate: "", endDate: "" }],
          },
        },
      ],
    ] as const) {
      let invalid = await mutateContent(p, admin.user, {
        action: "save",
        body: { ...body, ...patch, contentKey: key + "-" + suffix, slug: key + "-" + suffix },
      });
      drafts.push(invalid.id);
      invalid = await mutateContent(p, admin.user, {
        action: "submit",
        id: invalid.id,
        revision: invalid.revision,
      });
      await unchanged(async () =>
        assert.rejects(
          mutateContent(p, admin!.user, {
            action: "publish",
            id: invalid.id,
            revision: invalid.revision,
            overrideReason: "Fictional local review",
            exhibitionReviewed: true,
          }),
        ),
      );
    }
    draft = await mutateContent(p, admin.user, {
      action: "unpublish",
      id: draft.id,
      revision: draft.revision,
      overrideReason: "Fictional fixture cleanup",
    });
    assert.equal(await live(), undefined);
    console.log(
      "PASS visitor lifecycle: real authenticated save/review, source gates, draft snapshot isolation, version conflict, restore and withdrawal",
    );
  } finally {
    if (admin)
      for (const id of drafts) {
        const row = await p.findByID({ collection: "content-drafts", id });
        await mutateContent(p, admin.user, {
          action: "unpublish",
          id,
          revision: row.revision,
          overrideReason: "Fictional fixture cleanup",
        });
      }
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await db.end();
  }
}
