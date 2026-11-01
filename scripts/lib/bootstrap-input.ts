export function bootstrapInput(env: Record<string, string | undefined>) {
  if (env.APP_ENV !== "trial") throw Error("First administrator bootstrap is restricted to trial");
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL || "");
  } catch {
    throw Error("A trial PostgreSQL database is required");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || database.pathname.length < 2)
    throw Error("A trial PostgreSQL database is required");
  const email = env.BOOTSTRAP_ADMIN_EMAIL || "";
  const password = env.BOOTSTRAP_ADMIN_PASSWORD || "";
  const name = env.BOOTSTRAP_ADMIN_NAME || "华伴试运行管理员";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Set a valid BOOTSTRAP_ADMIN_EMAIL in the secret manager");
  if (password.length < 20 || password.length > 128)
    throw Error("Set a random BOOTSTRAP_ADMIN_PASSWORD of 20 to 128 characters");
  if (name.length > 100) throw Error("Administrator name is too long");
  return { email, password, name };
}
