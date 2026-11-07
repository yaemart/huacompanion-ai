import { toolLocales, visaToolPath } from "@/lib/visa-search";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
export const dynamic = "force-dynamic";
import { parseSiteLocales } from "@/lib/site-locales";

export function GET() {
  const tools = toolLocales(parseSiteLocales(process.env.SITE_LOCALES), visaCheckerEnabled())
    .map((locale) => `- China visa-free reference tool (${locale}): /${locale}/${visaToolPath}`)
    .join("\n");
  return new Response(
    `# Hua Companion / 华伴

Public information about visiting China. All arrangements are coordinated through Hua.

- Published content: /api/public/content?locale=en
- City life, restaurants, places and activities: /api/public/life?locale=en
- City life API documentation: /api/public/life/docs
- Institutions: /api/public/institutions/docs
- Exhibitions: /api/public/exhibitions/docs
- Sitemap: /sitemap.xml
${tools}

Supported locale codes: ${parseSiteLocales(process.env.SITE_LOCALES).join(", ")}. \
Public APIs are read-only and return published information only. Use returned inquiryPath for enquiries. A submission \
is not a confirmed booking. Respect currentStatus, sources and verification dates; unknown fields are not guarantees. No authorization to access private staff, customers, \
contacts or internal records.
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
