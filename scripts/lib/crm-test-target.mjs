/** Guard before importing Payload/config or making a connection. Never accepts demo targets. */
/** @param {string} raw @param {Record<string, string | undefined>} env */
export function assertCrmTarget(raw, env = process.env) {
  const u = new URL(raw);
  if (
    u.protocol !== "postgresql:" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "55443" ||
    u.username !== "crm_owner" ||
    !/^\/hua_crm_test_[a-f0-9]{32}$/.test(u.pathname) ||
    !u.password ||
    u.search ||
    u.hash ||
    env.PAYLOAD_DROP_DATABASE !== undefined ||
    ["PGOPTIONS", "PGHOST", "PGPORT", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE"].some(
      (k) => env[k] !== undefined,
    )
  )
    throw Error("CRM requires its dedicated loopback cluster and run-owned random database");
  return u;
}
