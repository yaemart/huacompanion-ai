import { getPayload } from "payload";
import config from "@/payload.config";
import { parseSiteLocales, publicFeatures } from "../lib/site-locales";
import { isLocale } from "../lib/locales";

export const getSiteLocales = () => parseSiteLocales(process.env.SITE_LOCALES);
export function isSiteLocale(value: unknown) {
  return isLocale(value) && getSiteLocales().includes(value);
}

export async function getPublicFeatures() {
  try {
    const p = await getPayload({ config });
    const [customer, support] = await Promise.all([
      p.findGlobal({ slug: "customer-settings", overrideAccess: true }),
      p.findGlobal({ slug: "support-settings", overrideAccess: true }),
    ]);
    return publicFeatures(customer, support);
  } catch {
    return publicFeatures(undefined, undefined);
  }
}
