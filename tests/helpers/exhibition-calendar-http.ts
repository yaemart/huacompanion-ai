import assert from "node:assert/strict";
import pg from "pg";
import type { Payload } from "payload";
import type { Staff } from "../../payload-types";
import type { ContentBody } from "../../src/lib/content-model";
import { mutateContent } from "../../src/server/content/service";
import { databaseFingerprints } from "./database-fingerprints";
import { parseSiteLocales } from "../../src/lib/site-locales";

export async function assertExhibitionCalendarHTTP({
  p,
  admin,
  draftId,
  body,
  base,
  publish,
}: {
  p: Payload;
  admin: Staff;
  draftId: number;
  body: ContentBody;
  base: string;
  publish: (body: ContentBody) => Promise<unknown>;
}) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await db.connect();
  const path = "/api/public/exhibitions/calendar?locale=en&key=" + body.contentKey;
  const read = async (status = 200, query = path, init?: RequestInit) => {
    const response = await fetch(base + query, { ...init, cache: "no-store" });
    assert.equal(response.status, status, "calendar HTTP: " + query);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    if (status === 200)
      assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
    return (await response.text()).replace(/\r\n[ \t]/g, "");
  };
  const unchanged = async (run: () => Promise<void>) => {
    const before = await databaseFingerprints(db);
    await run();
    assert.deepEqual(await databaseFingerprints(db), before, "calendar requests must be read-only");
  };
  try {
    const first = await read();
    assert.match(first, /DTSTART;VALUE=DATE:20900130\r\n/);
    assert.match(first, /DTEND;VALUE=DATE:20900203\r\n/);
    assert.ok(first.includes("SUMMARY:" + body.title + "\r\n"));
    assert.ok(first.includes("Fictional phase <A>"));
    assert.ok(first.includes("URL:" + base + "/en/exhibitions/" + body.slug + "\r\n"));
    assert.equal(first.match(/^BEGIN:VEVENT$/gm)?.length, 1);
    assert.doesNotMatch(first, /VALARM|ATTENDEE|METHOD:REQUEST/);
    const firstUID = first.match(/^UID:(.+)$/m)![1];
    const revision = Number(first.match(/^SEQUENCE:(\d+)/m)![1]);
    await unchanged(async () => {
      assert.ok(
        (await read(200, path, { headers: { host: "untrusted.example.invalid" } })).includes(
          "URL:" + base,
        ),
      );
      const download = await fetch(base + path);
      assert.equal(
        download.headers.get("content-disposition"),
        `attachment; filename="exhibition-en-${body.contentKey}.ics"`,
      );
      assert.equal(await read(200, path, { method: "HEAD" }), "");
      await read(400, "/api/public/exhibitions/calendar?locale=en&key=../draft");
      await read(404, path + "-missing");
      const active = parseSiteLocales(process.env.SITE_LOCALES);
      for (const locale of ["zh", "es", "fr", "de", "it", "ar"] as const)
        await read(
          active.includes(locale) ? 404 : 400,
          path.replace("locale=en", "locale=" + locale),
        );
      for (const method of ["POST", "PUT"])
        assert.equal((await fetch(base + path, { method })).status, 405);
    });
    const changed: ContentBody = {
      ...body,
      title: "PRIVATE_CALENDAR_DRAFT",
      exhibition: {
        ...body.exhibition!,
        startDate: "2090-03-01",
        endDate: "2090-03-02",
        phases: [],
      },
    };
    let current = await p.findByID({ collection: "content-drafts", id: draftId });
    await unchanged(async () => {
      await assert.rejects(
        mutateContent(p, admin, {
          action: "save",
          id: draftId,
          revision: current.revision,
          body: { ...changed, slug: body.slug + "-renamed" },
        }),
        /已发布的网址不能修改/,
      );
    });
    await mutateContent(p, admin, {
      action: "save",
      id: draftId,
      revision: current.revision,
      body: changed,
    });
    await unchanged(async () => {
      const stillPublished = await read();
      assert.doesNotMatch(stillPublished, /PRIVATE_CALENDAR_DRAFT/);
      assert.match(stillPublished, /DTSTART;VALUE=DATE:20900130\r\n/);
    });
    await publish(changed);
    const updated = await read();
    assert.match(updated, /SUMMARY:PRIVATE_CALENDAR_DRAFT\r\n/);
    assert.match(updated, /DTSTART;VALUE=DATE:20900301\r\n/);
    assert.match(updated, /DTEND;VALUE=DATE:20900303\r\n/);
    assert.equal(updated.match(/^UID:(.+)$/m)![1], firstUID);
    assert.ok(Number(updated.match(/^SEQUENCE:(\d+)/m)![1]) > revision);
    current = await p.findByID({ collection: "content-drafts", id: draftId });
    await mutateContent(p, admin, {
      action: "unpublish",
      id: draftId,
      revision: current.revision,
      overrideReason: "Fictional calendar withdrawal regression",
    });
    await unchanged(async () => {
      await read(404);
    });
    for (const status of ["pending", "postponed", "cancelled"] as const) {
      await publish({
        ...body,
        exhibition: { ...body.exhibition!, status, unresolved: "Fictional pending confirmation" },
      });
      await unchanged(async () => {
        await read(409);
      });
    }
    await publish({
      ...body,
      exhibition: {
        ...body.exhibition!,
        status: "ended",
        startDate: "2020-01-01",
        endDate: "2020-01-02",
        phases: [],
      },
    });
    assert.match(await read(), /DTEND;VALUE=DATE:20200103\r\n/);
    await publish(body);
    console.log(
      "PASS exhibition calendar HTTP: real published snapshot, draft isolation, stable revision UID, read-only fingerprints, HEAD/405, locale, status and withdrawal",
    );
  } finally {
    await db.end();
  }
}
