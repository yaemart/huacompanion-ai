/** Server-side opt-in; no public tool is implemented by this flag alone. */
export function visaCheckerEnabled(
  env: { VISA_CHECKER_ENABLED?: string } = {
    VISA_CHECKER_ENABLED: process.env.VISA_CHECKER_ENABLED,
  },
): boolean {
  return env.VISA_CHECKER_ENABLED === "true";
}
