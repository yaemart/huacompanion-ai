import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { Payload } from "payload";
import type { Staff } from "../../payload-types";

export const policyFacts = (verifiedBy: number) => ({
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
  verifiedBy,
  publicNotes: "Fictional policy for testing only",
  internalNotes: "Private verification fixture",
});
export async function policyFixture(
  p: Payload,
  run: (f: {
    key: string;
    body: object;
    admin: Staff;
    editor: Staff;
    reviewer: Staff;
    combined: Staff;
    outsider: Staff;
    password: string;
  }) => Promise<void>,
) {
  const key = `policy-flow-${randomUUID()}`;
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
      sort: "createdAt",
    })
  ).docs[0];
  assert.ok(admin);
  const actors: Staff[] = [];
  const password = randomUUID();
  async function actor(
    label: string,
    role: "editor" | "reviewer",
    combined = false,
    outside = false,
  ) {
    const person = await p.create({
      collection: "staff",
      user: admin,
      data: {
        name: label,
        email: `${key}-${label}@example.invalid`,
        password,
        role,
        active: true,
        contentKinds: [outside ? "guide" : "immigration-policy"],
        additionalRoles: combined ? ["editor"] : [],
      },
    });
    actors.push(person);
    return person;
  }
  try {
    const editor = await actor("editor", "editor"),
      reviewer = await actor("reviewer", "reviewer");
    const combined = await actor("combined", "reviewer", true),
      outsider = await actor("outsider", "editor", false, true);
    await run({
      key,
      admin,
      editor,
      reviewer,
      combined,
      outsider,
      password,
      body: {
        contentKey: key,
        slug: key,
        kind: "immigration-policy",
        locale: "en",
        title: "Fictional policy workflow",
        blocks: [{ type: "paragraph", text: "Fictional test only" }],
        sources: [],
      },
    });
  } finally {
    if (actors.length)
      await p.delete({
        collection: "content-agent-tasks",
        where: { createdBy: { in: actors.map((actor) => actor.id) } },
      });
    const drafts = (
      await p.find({
        collection: "content-drafts",
        where: { contentKey: { like: key } },
        limit: 100,
        depth: 0,
      })
    ).docs;
    for (const draft of drafts) {
      for (const collection of [
        "content-published",
        "content-events",
        "content-quality",
        "content-quality-events",
      ] as const)
        await p.delete({ collection, where: { draftId: { equals: draft.id } } });
      await p.delete({ collection: "content-drafts", id: draft.id });
    }
    await p.delete({ collection: "immigration-policies", where: { policyKey: { like: key } } });
    for (const person of actors)
      await p.delete({ collection: "staff", id: person.id, user: admin });
  }
}
