import type { Exhibition } from "@/lib/exhibitions";
import { exhibitionVisitorFields } from "@/lib/exhibitions";
import type { Locale } from "@/lib/locales";
import { exhibitionText } from "@/lib/exhibition-copy";

export function ExhibitionVisitorDetails({
  value: e,
  locale,
}: {
  value: Exhibition;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof exhibitionText>[1]) => exhibitionText(locale, key);
  return (
    <>
      {!!e.phases?.length && (
        <section className="exhibition-phases">
          <h2>{t("phases")}</h2>
          <div className="guide-grid">
            {e.phases.map((phase, index) => (
              <article className="guide-card" key={index}>
                <h3>{phase.name.trim() ? phase.name : t("unknown")}</h3>
                <p>
                  {phase.startDate && phase.endDate
                    ? `${phase.startDate} — ${phase.endDate}`
                    : t("unknown")}
                </p>
                <p>
                  <strong>{t("phaseTheme")}</strong>
                  <br />
                  {phase.theme}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
      {exhibitionVisitorFields.some((key) => e[key]?.trim()) && (
        <section className="exhibition-visitor">
          <h2>{t("visitorInfo")}</h2>
          <dl className="catalog-details exhibition-details">
            {exhibitionVisitorFields
              .filter((key) => e[key]?.trim())
              .map((key) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd>{e[key]}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}
    </>
  );
}
