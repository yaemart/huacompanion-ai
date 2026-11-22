import assert from "node:assert/strict";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
/** Advance the disposable fixture clock; never clear a committed in-flight reservation. */
export async function advanceDispatchClock(p: Payload) {
  const url = new URL(process.env.DATABASE_URL!);
  assert.match(url.pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
  assert.equal(process.env.APP_ENV, "local");
  await p.db.drizzle.execute(
    sql`UPDATE local_mail_dispatch
    SET next_at=clock_timestamp()-interval '1 millisecond' WHERE owner IS NULL` as unknown as Parameters<
      typeof p.db.drizzle.execute
    >[0],
  );
}
