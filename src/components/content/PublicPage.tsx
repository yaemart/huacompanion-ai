import { PublicFooter } from "../PublicFooter";
import type { Locale } from "@/lib/locales";
import type { ReactNode } from "react";
import { getSiteLocales } from "@/server/site-config";
import { publishedContent } from "@/server/content/published";
import { buildPublicNavigation } from "@/lib/public-navigation";
import { PublicNavigationProvider } from "../PublicNavigation";
import { PublicSubscription } from "./PublicSubscription";

export async function PublicPage({
  children,
  locale,
  subscriptionPath,
}: {
  children: ReactNode;
  locale: Locale;
  subscriptionPath?: string;
}) {
  const contents = (await Promise.all(getSiteLocales().map(publishedContent))).flat();
  const value = buildPublicNavigation(contents, process.env.APP_URL || "http://127.0.0.1:3000");
  return (
    <PublicNavigationProvider value={value}>
      {children}
      {subscriptionPath && (
        <PublicSubscription locale={locale} sourcePath={subscriptionPath} contents={contents} />
      )}
      <PublicFooter locale={locale} />
    </PublicNavigationProvider>
  );
}
