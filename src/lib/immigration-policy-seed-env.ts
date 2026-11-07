export function policySeedEnvironment(env: { APP_ENV?: string; DATABASE_URL?: string }): boolean {
  try {
    const db = new URL(env.DATABASE_URL || "postgresql://invalid");
    return (
      env.APP_ENV === "local" &&
      db.protocol === "postgresql:" &&
      db.hostname === "127.0.0.1" &&
      db.port === "55438" &&
      db.pathname === "/hua_companion" &&
      !db.search &&
      !db.hash
    );
  } catch {
    return false;
  }
}
