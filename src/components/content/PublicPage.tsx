import type { ReactNode } from "react";
import { getSiteLocales } from "@/server/site-config";
import { publishedContent } from "@/server/content/published";
import { buildPublicNavigation } from "@/lib/public-navigation";
import { PublicNavigationProvider } from "../PublicNavigation";

export async function PublicPage({ children }: { children: ReactNode }) {
  const contents = (await Promise.all(getSiteLocales().map(publishedContent))).flat();
  const value = buildPublicNavigation(contents, process.env.APP_URL || "http://127.0.0.1:3000");
  return <PublicNavigationProvider value={value}>{children}</PublicNavigationProvider>;
}
