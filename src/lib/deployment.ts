/** Public intake stays closed unless the trial operator deliberately enables it. */
export function intakeEnabled(env: Record<string, string | undefined>) {
  if (env.APP_ENV === "local") return true;
  if (env.APP_ENV !== "trial" || env.INTAKE_ENABLED !== "true" || !env.PRIVACY_VERSION?.trim())
    return false;
  try {
    const url = new URL(env.APP_URL || "");
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
