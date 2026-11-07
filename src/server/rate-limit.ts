import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

type QuotaPolicy = { bucket: number; clientLimit: number; globalLimit: number };
const defaultClientLimit = 60;
const defaultGlobalLimit = 6000;

/** Transaction order matters: an exhausted client never increments the shared last-resort cap. */
export async function consumeIntakeQuota(
  database: pg.Pool,
  clientKey: string,
  policy: QuotaPolicy,
): Promise<boolean> {
  if (!clientKey || clientKey === "global") throw new Error("A client key is required");
  const connection = await database.connect();
  try {
    await connection.query("BEGIN");
    const increment = async (key: string, cap: number) => {
      const result = await connection.query<{ count: string }>(
        `INSERT INTO intake_limits (bucket, client_key, count) VALUES ($1, $2, 1)
         ON CONFLICT (bucket, client_key) DO UPDATE
         SET count = intake_limits.count + 1, updated_at = now()
         WHERE intake_limits.count < $3 RETURNING count`,
        [policy.bucket, key, cap],
      );
      return result.rows.length > 0;
    };
    // Client attempts remain counted when the global cap rejects the request.
    const clientAllowed = await increment(clientKey, policy.clientLimit);
    const allowed = clientAllowed && (await increment("global", policy.globalLimit));
    await connection.query("COMMIT");
    return allowed;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

export async function intakeAllowed(clientKey: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 600000);
  const allowed = await consumeIntakeQuota(pool, clientKey, {
    bucket,
    clientLimit: defaultClientLimit,
    globalLimit: defaultGlobalLimit,
  });
  await pool.query("DELETE FROM intake_limits WHERE bucket < $1", [bucket - 6]);
  return allowed;
}
