import { isLife, lifeCanEnquire, effectiveLifeStatus } from "../../lib/lifestyle";
import { lifeText } from "../../lib/lifestyle-copy";
import { effectiveExhibitionStatus } from "../../lib/exhibitions";
import { coreText } from "../../lib/core-copy";
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
  requireRevision = !!req,
) {
  if (!source) return undefined;
  const docs = await listPublished(p, locale, req);
  const provider = source.provider
    ? docs.find((d) => d.kind === "provider-profile" && d.contentKey === source.provider)
    : undefined;
  const project = source.project
    ? docs.find((d) => d.kind === "service-project" && d.contentKey === source.project)
    : undefined;
  const life = source.life
    ? docs.find((d) => d.kind === source.lifeKind && d.contentKey === source.life)
    : undefined;
  const lifeError = () => new IntakeValidationError({ source: lifeText(locale, "unavailable") });
  if (
    source.life &&
    (!life?.lifestyle ||
      !isLife(life.kind) ||
      !lifeCanEnquire(life.lifestyle, life.kind) ||
      (source.project && !life.lifestyle.projectKeys.includes(source.project)))
  )
    throw lifeError();
  const institution = source.institution
    ? docs.find((d) => d.kind === "institution" && d.contentKey === source.institution)
    : undefined;
  const institutionError = () =>
    new IntakeValidationError({
      source: {
        zh: "所选机构已变更、暂停接待或与服务不匹配。请重新打开机构页面，或移除选择后提交一般咨询。",
        en: "The institution has changed, is unavailable or does not match this service. Reopen its page or remove the selection.",
        es: "La institución ha cambiado, no está disponible o no corresponde al servicio. Abre su página de nuevo o elimina la selección.",
        fr: "L’établissement a changé, est indisponible ou ne correspond pas au service. Rouvrez sa page ou retirez la sélection.",
        de: "Die Einrichtung wurde geändert, ist nicht verfügbar oder passt nicht zur Leistung. Öffnen Sie die Seite erneut oder entfernen Sie die Auswahl.",
        it: "La struttura è cambiata, non è disponibile o non corrisponde al servizio. Riapri la pagina o rimuovi la selezione.",
        ar: "تغيرت المؤسسة أو أنها غير متاحة أو لا تتوافق مع الخدمة. أعد فتح صفحتها أو أزل الاختيار.",
      }[locale],
    });
  if (
    source.institution &&
    (!institution?.institution ||
      institution.institution.foreignAcceptance !== "confirmed" ||
      source.exhibition ||
      source.provider ||
      (source.project && !institution.institution.projectKeys.includes(source.project)))
  )
    throw institutionError();
  const exhibition = source.exhibition
    ? docs.find((d) => d.kind === "exhibition" && d.contentKey === source.exhibition)
    : undefined;
  const exhibitionError = () =>
    new IntakeValidationError({
      source: coreText(
        locale,
        "The selected exhibition is unavailable, has changed, or does not match your service selection. Please reopen its page or remove the selection.",
      ),
    });
  if (
    source.exhibition &&
    (!exhibition?.exhibition ||
      ["cancelled", "ended"].includes(effectiveExhibitionStatus(exhibition.exhibition)) ||
      (source.project && !exhibition.exhibition.projectKeys.includes(source.project)) ||
      (source.provider && !source.project))
  )
    throw exhibitionError();
  if (
    (source.provider && !provider) ||
    (source.project && !project) ||
    project?.acceptingInquiries === false ||
    (provider && project && !project.catalog?.providerKeys.includes(provider.contentKey))
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
        s.body.contentKey === d.contentKey && s.body.locale === locale && s.body.kind === d.kind,
    )!;
    if (
      d.catalog?.categories.includes("housekeeping") &&
      ((d.kind === "provider-profile" && source.providerRevision !== s.revision) ||
        (d.kind === "service-project" && source.projectRevision !== s.revision))
    )
      throw new IntakeValidationError({
        source: coreText(
          locale,
          "The selected provider or project is unavailable or incompatible. Please choose again or remove the selection.",
        ),
      });
    if (isLife(d.kind) && requireRevision && source.lifeRevision !== s.revision) throw lifeError();
    if (d.kind === "exhibition" && requireRevision && source.exhibitionRevision !== s.revision)
      throw exhibitionError();
    if (d.kind === "institution" && requireRevision && source.institutionRevision !== s.revision)
      throw institutionError();
    return {
      key: d.contentKey,
      title: d.title,
      slug: d.slug,
      publishedAt: d.publishedAt,
      publicationId: s.id,
      revision: s.revision,
      ...(d.kind === "exhibition"
        ? {
            startDate: d.exhibition!.startDate,
            endDate: d.exhibition!.endDate,
            city: d.exhibition!.city,
            venue: d.exhibition!.venue,
            status: effectiveExhibitionStatus(d.exhibition!),
          }
        : {}),
      ...(isLife(d.kind)
        ? {
            city: d.lifestyle!.city,
            category: d.lifestyle!.category,
            address: d.lifestyle!.address,
            startAt: d.lifestyle!.startAt,
            endAt: d.lifestyle!.endAt,
            status: effectiveLifeStatus(d.lifestyle!, d.kind),
            kind: d.kind,
          }
        : {}),
      ...(d.kind === "institution"
        ? {
            city: d.institution!.city,
            type: d.institution!.type,
            foreignAcceptance: d.institution!.foreignAcceptance,
            verifiedAt: d.institution!.verifiedAt,
            address: d.institution!.address,
          }
        : {}),
      ...(d.kind === "provider-profile" ? { providerRef: s.providerRef } : {}),
      ...(d.catalog?.categories.includes("housekeeping")
        ? { housekeeping: d.catalog.housekeeping }
        : {}),
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
    ...(exhibition ? { exhibition: snapshot(exhibition) } : {}),
    ...(life ? { life: snapshot(life) } : {}),
    ...(institution ? { institution: snapshot(institution) } : {}),
  };
}
