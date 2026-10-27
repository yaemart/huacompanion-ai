import type { Payload } from "payload";
import type { ContentBody } from "../../lib/content-model";
export const providerEligible = (p: any) =>
  !!p?.publicApproved && ["verified", "contracted"].includes(p.status);
export async function eligibleProvider(p: Payload, id: unknown, req?: any) {
  if (!Number.isSafeInteger(id) || Number(id) < 1) return false;
  const result = await p.find({
    collection: "providers",
    where: { id: { equals: Number(id) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return providerEligible(result.docs[0]);
}
export async function allSnapshots(p: Payload, req?: any) {
  const docs: any[] = [];
  let page = 1;
  for (;;) {
    const r = await p.find({
      collection: "content-published",
      where: { active: { equals: true } },
      limit: 200,
      page,
      sort: "id",
      depth: 0,
      overrideAccess: true,
      req,
    });
    docs.push(...r.docs);
    if (!r.hasNextPage) break;
    page++;
  }
  return docs;
}
export async function catalogLock(req: any) {
  const id = await req.transactionID;
  if (!id) return;
  const sessions = req.payload.db.sessions as Record<
    string,
    { db: { execute: (q: string) => Promise<unknown> } }
  >;
  if (sessions[id])
    await sessions[id].db.execute("SELECT pg_advisory_xact_lock(726271)");
}
export async function suspendProviderProjects({ doc, req }: any) {
  if (providerEligible(doc)) return doc;
  const snapshots = await allSnapshots(req.payload, req);
  const keys = new Set(
    snapshots
      .filter((s) => s.providerRef === doc.id)
      .map((s) => (s.body as ContentBody).contentKey),
  );
  for (const s of snapshots) {
    const b = s.body as ContentBody;
    if (
      b.kind === "service-project" &&
      b.catalog?.fulfillment === "specified" &&
      b.catalog.providerKeys.some((k) => keys.has(k))
    )
      await req.payload.update({
        collection: "content-published",
        id: s.id,
        data: { suspended: true },
        req,
        overrideAccess: true,
      });
  }
  return doc;
}

export async function suspendProjectsForKey(
  p: Payload,
  key: string,
  locale: string,
  req?: any,
) {
  for (const s of await allSnapshots(p, req)) {
    const b = s.body as ContentBody;
    if (
      b.locale === locale &&
      b.kind === "service-project" &&
      b.catalog?.fulfillment === "specified" &&
      b.catalog.providerKeys.includes(key)
    )
      await p.update({
        collection: "content-published",
        id: s.id,
        data: { suspended: true },
        req,
        overrideAccess: true,
      });
  }
}
