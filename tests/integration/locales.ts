import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { locales, localeNames } from "../../src/lib/locales";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { saveIntake } from "../../src/server/intake";
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Dedicated local test database required");
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
const key = "locale-test-" + Date.now();
const drafts: number[] = [];
try {
  for (const locale of locales) {
    const body = {
      kind: "faq",
      contentKey: key,
      slug: key + "-" + locale,
      locale,
      title: "Fictional locale test " + locale,
      summary: "Local verification only",
      sources: [],
      blocks: [{ type: "paragraph", text: "Fictional verification content" }],
    };
    let draft = await mutateContent(p, admin, { action: "save", body });
    drafts.push(draft.id);
    draft = await mutateContent(p, admin, {
      action: "submit",
      id: draft.id,
      revision: draft.revision,
    });
    await mutateContent(p, admin, {
      action: "publish",
      overrideReason: "Local regression fixture review and cleanup",
      id: draft.id,
      revision: draft.revision,
    });
    const receipt = await saveIntake(
      {
        kind: "request",
        locale,
        values: {
          categories: ["business"],
          city: "Shanghai",
          people: "1",
          datesUnknown: true,
          name: "Fictional locale verification",
          email: "locale-test@example.com",
          language: localeNames[locale],
          consent: true,
        },
      },
      randomUUID(),
    );
    const inquiry = (
      await p.find({
        collection: "inquiries",
        where: { reference: { equals: receipt.reference } },
        limit: 1,
      })
    ).docs[0];
    assert.equal(inquiry.locale, locale);
  }
  for (const locale of locales) {
    const matches = (await listPublished(p, locale)).filter((d) => d.contentKey === key);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].locale, locale);
  }
  console.log("PASS seven-language database drafts, publication isolation and enquiry persistence");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const id of drafts) {
    const draft = await p.findByID({ collection: "content-drafts", id });
    await mutateContent(p, admin, {
      action: "unpublish",
      overrideReason: "Local regression fixture review and cleanup",
      id,
      revision: draft.revision,
    });
  }
  await p.destroy();
  process.exit(process.exitCode || 0);
}
