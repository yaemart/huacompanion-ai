import { getPayload } from "payload";
import config from "@/payload.config";
import type { Locale } from "@/lib/locales";
import { publicCompany } from "@/lib/public-company";
export async function readPublicCompany(locale: Locale) {
  const payload = await getPayload({ config });
  const settings = await payload.findGlobal({
    slug: "public-company-settings",
    depth: 0,
    overrideAccess: true,
  });
  return publicCompany(settings, locale);
}
