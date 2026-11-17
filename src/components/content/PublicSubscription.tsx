import { getPayload } from "payload";
import config from "@/payload.config";
import type { ContentBody } from "@/lib/content-model";
import { effectiveExhibitionStatus } from "@/lib/exhibitions";
import type { Locale } from "@/lib/locales";
import { subscriptionTopics } from "@/lib/subscription-topics";
import { subscriptionRequestConfig } from "@/server/subscription-readiness";
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
  if (!ready || (locale !== "en" && locale !== "zh")) return null;
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
  const exhibit =
    section === "exhibitions" &&
    contents.find(
      (doc) =>
        doc.locale === locale &&
        doc.kind === "exhibition" &&
        doc.slug === slug &&
        doc.exhibition &&
        !["cancelled", "ended"].includes(effectiveExhibitionStatus(doc.exhibition)),
    );
  const topics = Object.entries(subscriptionTopics).map(([value, label]) => ({
    value,
    label: label[locale],
  }));
  const exhibitTopic = exhibit ? `exhibition:${exhibit.contentKey}` : "";
  if (exhibit) topics.push({ value: exhibitTopic, label: exhibit.title });
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
      preset={exhibitTopic || presets[section] || ""}
    />
  );
}
