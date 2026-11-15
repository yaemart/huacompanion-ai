import { createHash } from "node:crypto";
import type { CollectionAfterChangeHook, Payload, PayloadRequest } from "payload";
import type { ContentDraft } from "../../../payload-types";
import { contentVersion } from "../../lib/quality";
export const versionOf = (body: unknown) =>
  createHash("sha256").update(contentVersion(body)).digest("hex");
export const contentQualityHook: CollectionAfterChangeHook<ContentDraft> = async ({
  doc,
  previousDoc,
  req,
}) => updateContentDraftQuality(req.payload, doc, previousDoc, req);

/** Runs in the caller's content transaction; never writes published snapshots or other drafts. */
export async function updateContentDraftQuality(
  p: Payload,
  doc: ContentDraft,
  previousDoc: ContentDraft | undefined,
  req: Partial<PayloadRequest>,
) {
  const version = versionOf(doc.body);
  if (previousDoc?.body !== undefined && version === versionOf(previousDoc.body)) return doc;
  const existing = (
    await p.find({
      collection: "content-quality",
      where: { draftId: { equals: doc.id } },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
    })
  ).docs[0];
  const data = {
    draftId: doc.id,
    title: doc.title,
    kind: doc.kind,
    contentKey: doc.contentKey,
    locale: doc.locale,
    contentVersion: version,
    state: "review-needed" as const,
    sourceDraft: doc.sourceDraft || null,
  };
  if (existing)
    await p.update({
      collection: "content-quality",
      id: existing.id,
      data,
      req,
      overrideAccess: true,
    });
  else await p.create({ collection: "content-quality", data, req, overrideAccess: true });
  // Only explicitly linked translations sharing the key and kind depend on this source.
  const translations = await p.find({
    collection: "content-drafts",
    where: {
      and: [
        { sourceDraft: { equals: doc.id } },
        { contentKey: { equals: doc.contentKey } },
        { kind: { equals: doc.kind } },
      ],
    },
    pagination: false,
    depth: 0,
    req,
    overrideAccess: true,
  });
  for (const translation of translations.docs) {
    await p.update({
      collection: "content-quality",
      where: { draftId: { equals: translation.id } },
      data: { state: "review-needed" },
      req,
      overrideAccess: true,
    });
  }
  return doc;
}
