import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { parseSchedulerLedger } from "../lib/exhibition-reminder-scheduler-state";
import { executeSQL } from "./db-types";
import { withReminderReadOnly } from "./exhibition-reminder-authority";
import { ContentError } from "./content/error";

export async function readSchedulerLedger(p: Payload, req: Partial<PayloadRequest>) {
  try {
    const id = await req.transactionID;
    if (!id) throw Error();
    const { rows } = await executeSQL(
      p,
      id,
      sql`SELECT id,action,after FROM audit_events
      WHERE entity='exhibition-reminder-scheduler' AND record_id='global' ORDER BY id DESC LIMIT 1`,
    );
    const row = rows[0] as { id: number; action: string; after: unknown } | undefined;
    if (row) {
      if (row.action !== "state-v1") throw Error();
      return parseSchedulerLedger({ revision: row.id, state: row.after });
    }
    const orphan = await executeSQL(
      p,
      id,
      sql`SELECT id FROM audit_events WHERE entity='exhibition-reminder-scheduler' LIMIT 1`,
    );
    if (orphan.rows.length) throw Error();
    return parseSchedulerLedger({
      revision: 0,
      state: { version: 1, runId: null, owner: null, targets: [], pending: null },
    });
  } catch {
    throw new ContentError("持久调度状态无法核实，请先检查审计记录。", 503);
  }
}
export async function readExhibitionSchedulerStatus(p: Payload, headers: Headers) {
  return withReminderReadOnly(p, headers, async ({ req }) => {
    const { revision, state } = await readSchedulerLedger(p, req);
    const status =
      revision === 0
        ? "unregistered"
        : state.pending
          ? "blocked"
          : state.runId
            ? "running"
            : "idle";
    return { status, revision, ...(state.pending ? { scope: state.pending.scope } : {}) } as const;
  });
}
