/** Fail before Payload initialization; never seed exhibition test accounts in an existing demo. */
export function assertExhibitionTestDatabase(
  env: Record<string, string | undefined> = process.env,
) {
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (
      env.APP_ENV !== "local" ||
      url.protocol !== "postgresql:" ||
      url.hostname !== "127.0.0.1" ||
      url.search ||
      url.hash ||
      !(
        (url.port === "55438" && url.username === "hua" && url.pathname === "/hua_companion") ||
        (url.port === "55442" &&
          url.username === "hua_demo" &&
          /^\/hua_exhibitions_[a-f0-9]{32}$/.test(url.pathname))
      )
    )
      throw Error();
  } catch {
    throw Error(
      "Exhibition tests require a dedicated test database; the existing demo is not allowed.",
    );
  }
}
