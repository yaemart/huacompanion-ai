import assert from "node:assert/strict";
import type { Payload } from "payload";
import type { Staff } from "../../payload-types";
import { mutateContent } from "../../src/server/content/service";

export async function verifyPolicyFAQHTTP(
  p: Payload,
  admin: Staff,
  read: (locale?: string) => Promise<string>,
  key: string,
  today: string,
) {
  assert.match(key, /^policy-faq-fixture-[a-z-]+$/);
  assert.equal(
    (await p.count({ collection: "content-drafts", where: { contentKey: { equals: key } } }))
      .totalDocs,
    0,
  );
  let faq: Awaited<ReturnType<typeof mutateContent>> | undefined;
  const title = `Fictional question ${key}?`;
  const answer = "Fictional answer only, not travel advice.";
  const body = {
    contentKey: key,
    slug: key,
    kind: "faq",
    locale: "en",
    title,
    blocks: [{ type: "paragraph", text: answer }],
    sources: [
      {
        id: "test",
        title: "Fictional source",
        url: "https://example.invalid/faq",
        checkedAt: today,
      },
    ],
  };
  try {
    faq = await mutateContent(p, admin, { action: "save", body });
    assert.ok(!(await read()).includes(title));
    faq = await mutateContent(p, admin, { action: "submit", id: faq.id, revision: faq.revision });
    assert.ok(!(await read()).includes(title));
    faq = await mutateContent(p, admin, {
      action: "publish",
      id: faq.id,
      revision: faq.revision,
      overrideReason: "Fictional FAQ HTTP test",
    });
    const html = await read();
    assert.ok(html.includes(`<summary>${title}</summary>`));
    const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    const data = JSON.parse(script);
    assert.equal(data.mainEntity[0].name, title);
    assert.equal(data.mainEntity[0].acceptedAnswer.text, answer);
    assert.ok(!(await read("zh")).includes(title));
    faq = await mutateContent(p, admin, {
      action: "save",
      id: faq.id,
      revision: faq.revision,
      body: { ...body, blocks: [{ type: "paragraph", text: "Unpublished FAQ edit" }] },
    });
    const edited = await read();
    assert.ok(edited.includes(answer));
    assert.ok(!edited.includes("Unpublished FAQ edit"));
    await mutateContent(p, admin, {
      action: "unpublish",
      id: faq.id,
      revision: faq.revision,
      overrideReason: "Fictional FAQ HTTP cleanup",
    });
    const removed = await read();
    assert.ok(!removed.includes(title));
    assert.ok(!removed.includes('"@type":"FAQPage"'));
    console.log(
      "PASS FAQ draft/review hidden, published visible/schema equality, language isolation, draft snapshot stability and unpublish",
    );
  } finally {
    if (faq) {
      for (const collection of [
        "content-published",
        "content-events",
        "content-quality",
        "content-quality-events",
      ] as const)
        await p.delete({ collection, where: { draftId: { equals: faq.id } } });
      await p.delete({ collection: "content-drafts", id: faq.id });
    }
  }
}
