import type { ContentBody } from "./content-model.ts";
import type { Locale } from "./locales.ts";
import { contentSections, sectionFor } from "./content-sections.ts";

export type PublicNavigationData = { paths: string[]; origin: string };
const sections: Partial<Record<ContentBody["kind"], string>> = {
  service: "services",
  "service-project": "services/projects",
  "provider-profile": "providers",
  guide: "guides",
  partner: "partners",
  exhibition: "exhibitions",
  institution: "institutions",
  venue: "life",
  activity: "life",
};
export function buildPublicNavigation(
  contents: ContentBody[],
  origin: string,
): PublicNavigationData {
  const paths = new Set<string>();
  for (const body of contents) {
    const section = sections[body.kind];
    if (section) {
      paths.add(`/${body.locale}/${section}`);
      if (body.kind === "service-project") paths.add(`/${body.locale}/services`);
      paths.add(`/${body.locale}/${section}/${body.slug}`);
    } else if (body.kind === "page") paths.add(`/${body.locale}/${body.slug}`);
  }
  return { paths: [...paths], origin: new URL(origin).origin };
}
export function isPublishedDestination(href: string, data: PublicNavigationData) {
  try {
    const url = new URL(href, data.origin);
    if (url.origin !== data.origin) return true;
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    const [, , section] = path.split("/");
    if (section === "services") return data.paths.includes(path);
    if (
      /^\/[a-z]{2}\/(providers|exhibitions|institutions|life|guides|partners|about|contact)$/.test(
        path,
      )
    )
      return data.paths.includes(path);
    return true;
  } catch {
    return false;
  }
}
export function publishedGuideSections(contents: ContentBody[], locale: Locale) {
  const guides = contents.filter((body) => body.kind === "guide" && body.locale === locale);
  return contentSections
    .map((section) => ({
      ...section,
      count: guides.filter((d) => sectionFor(d) === section.id).length,
    }))
    .filter((section) => section.count > 0);
}
