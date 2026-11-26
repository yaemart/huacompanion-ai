import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Payload } from "payload";
import type { Staff } from "../../payload-types";
import type { ContentBody } from "../../src/lib/content-model";
import { mutateContent } from "../../src/server/content/service";
import { databaseFingerprints } from "./database-fingerprints";
import { shanghaiToday } from "../../src/lib/exhibitions";

export async function assertExhibitionNextEditionHTTP(
  p: Payload,
  admin: Staff,
  base: string,
  fixture: ContentBody,
) {
  const prefix = "edition-http-" + randomUUID();
  const ids: number[] = [];
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await db.connect();
  const release = async (body: ContentBody, id?: number) => {
    const current = id ? await p.findByID({ collection: "content-drafts", id }) : undefined;
    let d = await mutateContent(p, admin, {
      action: "save",
      body,
      id,
      revision: current?.revision,
    });
    if (!id) ids.push(d.id);
    d = await mutateContent(p, admin, { action: "submit", id: d.id, revision: d.revision });
    return mutateContent(p, admin, {
      action: "publish",
      id: d.id,
      revision: d.revision,
      exhibitionReviewed: true,
      overrideReason: "Fictional next-edition HTTP review",
    });
  };
  const initial: ContentBody = {
    ...fixture,
    contentKey: prefix + "-future",
    slug: prefix + "-future",
    title: "Fictional approved next <edition>",
    sources: fixture.sources.map((s) => ({ ...s, checkedAt: shanghaiToday() })),
    exhibition: {
      ...fixture.exhibition!,
      phases: [],
      nextEditionKey: "",
      verifiedAt: shanghaiToday(),
      startDate: "2091-01-01",
      endDate: "2091-01-03",
      status: "announced",
    },
  };
  const history: ContentBody = {
    ...initial,
    contentKey: prefix + "-old",
    slug: prefix + "-old",
    title: "Fictional historical edition",
    exhibition: {
      ...initial.exhibition!,
      startDate: "2020-01-01",
      endDate: "2020-01-03",
      nextEditionKey: initial.contentKey,
    },
  };
  const oldPath = "/en/exhibitions/" + history.slug;
  const page = async () => {
    const response = await fetch(base + oldPath, { redirect: "manual", cache: "no-store" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null, "history URL is retained, not redirected");
    return response.text();
  };
  const section = (html: string) =>
    html.match(/<section class="[^"]*exhibition-next-edition[^]*?<\/section>/)?.[0] || "";
  const calendar = async () => {
    const response = await fetch(
      base + "/api/public/exhibitions/calendar?locale=en&key=" + history.contentKey,
    );
    assert.equal(response.status, 200);
    const text = (await response.text()).replace(/\r\n[ \t]/g, "");
    assert.match(text, /DTSTART;VALUE=DATE:20200101\r\n/);
    assert.match(text, /DTEND;VALUE=DATE:20200104\r\n/);
    assert.equal(text.match(/^BEGIN:VEVENT$/gm)?.length, 1);
    assert.doesNotMatch(text, /Fictional approved next/);
    return text.match(/^UID:(.+)$/m)![1];
  };
  const unchanged = async (read: () => Promise<void>) => {
    const before = await databaseFingerprints(db);
    await read();
    assert.deepEqual(await databaseFingerprints(db), before);
  };
  try {
    let target = await release(initial);
    const old = await release(history);
    await unchanged(async () => {
      const html = await page();
      assert.ok(section(html));
      assert.ok(section(html).includes(`href="/en/exhibitions/${initial.slug}"`));
      assert.match(section(html), /Fictional approved next &lt;edition&gt;/);
      assert.match(section(html), /2091-01-01 — 2091-01-03/);
    });
    const uid = await calendar();
    const editedSource = await mutateContent(p, admin, {
      action: "save",
      id: old.id,
      revision: old.revision,
      body: { ...history, exhibition: { ...history.exhibition!, nextEditionKey: "" } },
    });
    await unchanged(async () => {
      assert.ok(
        section(await page()).includes(initial.slug),
        "unreviewed source edits do not replace its public relation",
      );
    });
    await mutateContent(p, admin, {
      action: "save",
      id: target.id,
      revision: target.revision,
      body: {
        ...initial,
        title: "PRIVATE_NEXT_HTTP_DRAFT",
        exhibition: { ...initial.exhibition!, status: "cancelled" },
      },
    });
    await unchanged(async () => {
      const html = await page();
      assert.match(section(html), /Fictional approved next &lt;edition&gt;/);
      assert.doesNotMatch(html, /PRIVATE_NEXT_HTTP_DRAFT/);
    });
    target = await release(
      { ...initial, exhibition: { ...initial.exhibition!, status: "cancelled" } },
      target.id,
    );
    assert.equal(section(await page()), "");
    target = await release(
      {
        ...initial,
        exhibition: {
          ...initial.exhibition!,
          status: "pending",
          startDate: "",
          endDate: "",
          unresolved: "Fictional dates pending",
        },
      },
      target.id,
    );
    assert.match(section(await page()), /Dates to be announced/);
    target = await release(
      {
        ...initial,
        exhibition: {
          ...initial.exhibition!,
          startDate: "2025-01-01",
          endDate: "2025-01-03",
          status: "ended",
        },
      },
      target.id,
    );
    assert.equal(section(await page()), "");
    const current = await p.findByID({ collection: "content-drafts", id: target.id });
    await mutateContent(p, admin, {
      action: "unpublish",
      id: target.id,
      revision: current.revision,
      overrideReason: "Fictional next-edition HTTP withdrawal",
    });
    await release({ ...initial, locale: "zh" });
    await unchanged(async () => {
      assert.equal(section(await page()), "", "do not fall back to another language");
      assert.equal((await fetch(base + "/en/exhibitions/" + initial.slug)).status, 404);
      assert.equal(
        await calendar(),
        uid,
        "do not retarget or replace the historical calendar event",
      );
    });
    await release(initial, target.id);
    assert.ok(section(await page()));
    const unchangedSource = await p.findByID({ collection: "content-drafts", id: old.id });
    assert.equal(
      unchangedSource.revision,
      editedSource.revision,
      "target changes never rewrite the source",
    );
    console.log(
      "PASS next-edition HTTP: retained historical URL, approved-only target, draft isolation, pending dates, cancellation/end/withdrawal and locale hiding, restored link and unchanged calendar UID",
    );
  } finally {
    for (const id of ids) {
      const d = await p.findByID({ collection: "content-drafts", id });
      await mutateContent(p, admin, {
        action: "unpublish",
        id,
        revision: d.revision,
        overrideReason: "Fictional next-edition HTTP cleanup",
      });
    }
    await db.end();
  }
}
