import Link from "next/link";
import { resolveNextEdition, type ExhibitionEdition } from "@/lib/exhibition-next-edition";
import { exhibitionPath } from "@/lib/exhibitions";
import { exhibitionText } from "@/lib/exhibition-copy";

export function ExhibitionNextEdition({
  source,
  published,
}: {
  source: ExhibitionEdition;
  published: ExhibitionEdition[];
}) {
  const next = resolveNextEdition(source, published);
  if (!next?.exhibition) return null;
  const t = (key: Parameters<typeof exhibitionText>[1]) => exhibitionText(source.locale, key);
  const e = next.exhibition;
  return (
    <section className="guide-card exhibition-next-edition">
      <h2>{t("nextEdition")}</h2>
      <Link href={exhibitionPath(next)}>
        {t("viewNextEdition")} · {next.title}
      </Link>
      <p>
        {e.status === "announced"
          ? `${e.startDate} — ${e.endDate}`
          : e.status === "postponed"
            ? `${t("postponed")} · ${t("unknown")}`
            : t("nextEditionPending")}
      </p>
    </section>
  );
}
