import type { PostgresAdapter, sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

/** The configured PostgreSQL adapter owns transaction sessions. */
export function transactionSession(payload: Payload, id: number | string) {
  return (payload.db as Pick<PostgresAdapter, "sessions">).sessions[id];
}

/** Installed adapter/driver have distinct Drizzle type copies; keep the bridge here. */
export function executeSQL(
  payload: Payload,
  id: number | string,
  statement: ReturnType<typeof sql>,
) {
  const db = transactionSession(payload, id).db;
  return db.execute(statement as unknown as Parameters<typeof db.execute>[0]);
}

/** Persisted support-conversation inquiryLinks entries. */
export interface SupportInquiryLink {
  reference: string;
  key?: string;
}
