import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});
// Shared global limit is deliberate: never trust spoofable forwarded IP headers.
// Configure trusted edge per-client limits when deploying; no private address data is retained here.
export async function intakeAllowed() {
  const bucket = Math.floor(Date.now() / 600000);
  const result = await pool.query(
    "INSERT INTO intake_limits (bucket, count) VALUES ($1,1) ON CONFLICT (bucket) DO UPDATE SET count=intake_limits.count+1 RETURNING count",
    [bucket],
  );
  await pool.query("DELETE FROM intake_limits WHERE bucket < $1", [bucket - 6]);
  return result.rows[0].count <= 60;
}
