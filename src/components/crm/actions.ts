import type { Draft, Options } from "./types";
export function clientActionPayload(d: Draft, options: Options) {
  const v = d.values,
    body: Record<string, unknown> = { action: d.action, ...d.base };
  if (["createClient", "updateClient"].includes(d.action)) {
    Object.assign(body, {
      displayName: v.displayName,
      language: v.language,
      countryCode: v.countryCode || null,
    });
    if (d.action === "createClient") {
      body.kind = v.kind;
      if (options?.role === "admin") body.teamID = Number(v.teamID);
      if (options?.role !== "operations") body.ownerID = v.ownerID ? Number(v.ownerID) : null;
    }
  } else if (d.action === "saveContact") {
    Object.assign(body, {
      name: v.name,
      email: v.email || null,
      phone: v.phone || null,
      jobTitle: v.jobTitle || null,
    });
  } else if (d.action !== "setPrimaryContact") body.reason = v.reason;
  return body;
}
