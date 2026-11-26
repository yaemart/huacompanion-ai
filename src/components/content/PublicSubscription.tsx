import { getPayload } from "payload";
import config from "@/payload.config";
import type { ContentBody } from "@/lib/content-model";
import { isExhibitionSubscribable } from "@/lib/exhibition-subscription";
import type { Locale } from "@/lib/locales";
import { subscriptionTopics } from "@/lib/subscription-topics";
import { subscriptionRequestConfig } from "@/server/subscription-readiness";
import { isSiteLocale } from "@/server/site-config";
import { SubscriptionForm } from "./SubscriptionForm";

export async function PublicSubscription({
  locale,
  sourcePath,
  contents,
}: {
  locale: Locale;
  sourcePath: string;
  contents: ContentBody[];
}) {
  const ready = subscriptionRequestConfig();
  if (!ready || (locale !== "en" && locale !== "zh") || !isSiteLocale(locale)) return null;
  if (
    !contents.some((doc) => doc.locale === locale && doc.kind === "page" && doc.slug === "privacy")
  )
    return null;
  try {
    const payload = await getPayload({ config });
    if (!(await payload.findGlobal({ slug: "workflow-settings" })).emailEnabled) return null;
  } catch {
    return null;
  }
  const [, , section, slug] = sourcePath.split("/");
  const dedicated = section === "exhibitions" && !!slug;
  const exhibit =
    dedicated &&
    contents.find((doc) => doc.locale === locale && doc.kind === "exhibition" && doc.slug === slug);
  if (dedicated && (!exhibit || !isExhibitionSubscribable(exhibit, locale))) return null;
  const topics = Object.entries(subscriptionTopics).map(([value, label]) => ({
    value,
    label: label[locale],
  }));
  const presets: Record<string, string> = {
    tools: "policy-updates",
    exhibitions: "exhibition-alerts",
  };
  return (
    <SubscriptionForm
      key={`${sourcePath}:${ready.privacyVersion}`}
      locale={locale}
      sourcePath={sourcePath}
      privacyVersion={ready.privacyVersion}
      topics={topics}
      preset={presets[section] || ""}
      exhibition={
        exhibit
          ? {
              contentKey: exhibit.contentKey,
              title: exhibit.title,
              status: exhibit.exhibition?.status,
            }
          : undefined
      }
    />
  );
}
