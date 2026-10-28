import type { Locale } from "../../lib/locales";
import { allSnapshots } from "./eligibility";
import type { Payload } from "payload";
import type { CatalogSource } from "../../lib/catalog";
import { listPublished } from "../content/service";
import { IntakeValidationError } from "../../lib/intake-validation";
export async function resolveCatalogSource(
  p: Payload,
  locale: Locale,
  source: CatalogSource | undefined,
  req?: any,
) {
  if (!source) return undefined;
  const docs = await listPublished(p, locale, req);
  const provider = source.provider
    ? docs.find(
        (d) =>
          d.kind === "provider-profile" && d.contentKey === source.provider,
      )
    : undefined;
  const project = source.project
    ? docs.find(
        (d) => d.kind === "service-project" && d.contentKey === source.project,
      )
    : undefined;
  if (
    (source.provider && !provider) ||
    (source.project && !project) ||
    project?.acceptingInquiries === false ||
    (provider &&
      project &&
      !project.catalog?.providerKeys.includes(provider.contentKey))
  )
    throw new IntakeValidationError({
      source: {
        zh: "所选服务商或项目已失效，或两者不匹配。请重新选择，或主动移除选择后提交一般咨询。",
        en: "The selection is unavailable or incompatible. Choose again, or remove it to send a general enquiry.",
        es: "La selección no está disponible o no es compatible. Elige otra opción o elimínala para enviar una consulta general.",
        fr: "La sélection est indisponible ou incompatible. Choisissez à nouveau ou retirez-la pour envoyer une demande générale.",
        de: "Die Auswahl ist nicht verfügbar oder nicht kompatibel. Wählen Sie erneut oder entfernen Sie sie für eine allgemeine Anfrage.",
        it: "La selezione non è disponibile o non è compatibile. Scegli di nuovo o rimuovila per inviare una richiesta generale.",
        ar: "الخيار غير متاح أو غير متوافق. اختر مرة أخرى أو أزله لإرسال استفسار عام.",
      }[locale],
    });
  const raw = await allSnapshots(p, req);
  const snapshot = (d: NonNullable<typeof provider>) => {
    const s = raw.find(
      (s) =>
        s.body.contentKey === d.contentKey &&
        s.body.locale === locale &&
        s.body.kind === d.kind,
    )!;
    return {
      key: d.contentKey,
      title: d.title,
      slug: d.slug,
      publishedAt: d.publishedAt,
      publicationId: s.id,
      revision: s.revision,
      ...(d.kind === "provider-profile" ? { providerRef: s.providerRef } : {}),
      ...(d.kind === "service-project"
        ? {
            fulfillment: d.catalog!.fulfillment,
            requiredProviders: d.catalog!.providerKeys.map((key) => {
              const linked = raw.find(
                (s) =>
                  s.body.contentKey === key &&
                  s.body.locale === locale &&
                  s.body.kind === "provider-profile",
              )!;
              return {
                key,
                title: linked.body.title,
                providerRef: linked.providerRef,
                publicationId: linked.id,
                revision: linked.revision,
              };
            }),
          }
        : {}),
    };
  };
  return {
    ...(provider ? { provider: snapshot(provider) } : {}),
    ...(project ? { project: snapshot(project) } : {}),
  };
}
