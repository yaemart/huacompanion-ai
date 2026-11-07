import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

/** The configured PostgreSQL adapter owns transaction sessions. */
export function transactionSession(payload: Payload, id: number | string) {
  return (payload.db as Pick<PostgresAdapter, "sessions">).sessions[id];
}

/** Persisted support-conversation inquiryLinks entries. */
export interface SupportInquiryLink {
  reference: string;
  key?: string;
}
