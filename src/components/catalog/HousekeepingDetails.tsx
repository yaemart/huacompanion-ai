import { homeTexts, type Housekeeping } from "@/lib/housekeeping";
import { homeText } from "@/lib/housekeeping-copy";
import { localeNames, type Locale } from "@/lib/locales";
export function HousekeepingDetails({ value: h, locale }: { value: Housekeeping; locale: Locale }) {
  const t = (k: string) => homeText(locale, k);
  return (
    <section>
      <h2>{t("title")}</h2>
      <p>{h.services.map(t).join(" · ")}</p>
      <dl className="life-facts">
        {homeTexts.map((k) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>{h[k] || t("confirm")}</dd>
          </div>
        ))}
        {(["customerLanguages", "workerLanguages"] as const).map((k) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>
              {h[k].length ? h[k].map((l) => localeNames[l as Locale]).join(" · ") : t("confirm")}
            </dd>
          </div>
        ))}
      </dl>
      <p>{t("boundary")}</p>
    </section>
  );
}
