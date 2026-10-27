import { resolveCatalogSource } from "./catalog/source";
import { catalogLock } from "./catalog/eligibility";
import { createHash, randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { parseIntake } from "@/lib/intake-validation";
export class IntakeConflict extends Error {}
export async function saveIntake(input: unknown, key: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  )
    throw new IntakeConflict("Invalid request key");
  const parsed = parseIntake(input);
  const { kind, locale, values } = parsed;
  const requestKey = createHash("sha256").update(key).digest("hex");
  const contentHash = createHash("sha256")
    .update(JSON.stringify(parsed))
    .digest("hex");
  const payload = await getPayload({ config });
  const collection = kind === "request" ? "inquiries" : "providers";
  const existing = async () => {
    const result = await payload.find({
      collection,
      overrideAccess: true,
      where: { requestKey: { equals: requestKey } },
      limit: 1,
      depth: 0,
    });
    const doc = result.docs[0];
    if (!doc) return null;
    if (doc.contentHash !== contentHash)
      throw new IntakeConflict(
        "Request key was already used with different information",
      );
    return { reference: doc.reference, duplicate: true };
  };
  const prior = await existing();
  if (prior) return prior;
  const transactionID = await payload.db.beginTransaction();
  if (!transactionID) throw Error("Transactions required");
  const req = { transactionID };
  const reference = `HC-${kind === "request" ? "Q" : "P"}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
  try {
    await catalogLock({ ...req, payload });
    const catalogSource = await resolveCatalogSource(
      payload,
      locale,
      parsed.source,
      req,
    );
    const common = {
      reference,
      name: String(values.name),
      email: String(values.email),
      categories: values.categories as (
        | "medical"
        | "business"
        | "transport"
        | "stays"
        | "travel"
        | "interpretation"
        | "arrival"
      )[],
      city: String(values.city),
      details: values,
      source: "website" as const,
      locale,
      consentAt: new Date().toISOString(),
      privacyVersion: "local-testing-2026-10-27",
      requestKey,
      contentHash,
    };
    if (kind === "request")
      await payload.create({
        collection: "inquiries",
        overrideAccess: true,
        req,
        data: {
          ...common,
          status: "new",
          ...(catalogSource ? { catalogSource } : {}),
        },
      });
    else
      await payload.create({
        collection: "providers",
        overrideAccess: true,
        req,
        data: {
          ...common,
          status: "applied",
          organisation: String(values.organisation),
          phone: String(values.phone),
          languages: String(values.languages),
          capabilities: String(values.capabilities),
          website: String(values.website || ""),
          hours: String(values.hours || ""),
          qualification: String(values.qualification || ""),
        },
      });
    await payload.create({
      collection: "notifications",
      overrideAccess: true,
      req,
      data: { reference, kind, status: "awaiting-configuration", attempts: 0 },
    });
    await payload.db.commitTransaction(transactionID);
    return { reference, duplicate: false };
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    const raced = await existing();
    if (raced) return raced;
    throw error;
  }
}
