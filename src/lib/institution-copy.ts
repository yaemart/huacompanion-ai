import type { Locale } from "./locales";
import { exhibitionCopy } from "./exhibition-copy";
// Shared directory controls already have reviewed seven-language wording.
const rows = {
  title: [
    "Medical & wellness institutions",
    "医疗与康养机构",
    "Instituciones médicas y de bienestar",
    "Établissements médicaux et de bien-être",
    "Medizinische Einrichtungen und Wellness",
    "Strutture mediche e benessere",
    "المؤسسات الطبية والعافية",
  ],
  intro: [
    "Explore published institution information and coordinate your enquiry through Hua.",
    "了解已发布的机构信息，由华伴统一协调咨询。",
    "Consulte la información publicada y coordine su consulta con Hua.",
    "Consultez les informations publiées et coordonnez votre demande avec Hua.",
    "Informieren Sie sich über Einrichtungen und koordinieren Sie Ihre Anfrage mit Hua.",
    "Consulta le informazioni pubblicate e coordina la richiesta con Hua.",
    "اطلع على معلومات المؤسسات المنشورة ونسق استفسارك عبر هوا.",
  ],
  type: [
    "Institution type",
    "机构类型",
    "Tipo de institución",
    "Type d’établissement",
    "Einrichtungsart",
    "Tipo di struttura",
    "نوع المؤسسة",
  ],
  allTypes: [
    "All types",
    "全部类型",
    "Todos los tipos",
    "Tous les types",
    "Alle Arten",
    "Tutti i tipi",
    "جميع الأنواع",
  ],
  medical: [
    "Medical",
    "医疗",
    "Atención médica",
    "Soins médicaux",
    "Medizin",
    "Assistenza medica",
    "الرعاية الطبية",
  ],
  rehabilitation: [
    "Rehabilitation",
    "康复",
    "Rehabilitación",
    "Rééducation",
    "Rehabilitation",
    "Riabilitazione",
    "إعادة التأهيل",
  ],
  wellness: ["Wellness", "康养", "Bienestar", "Bien-être", "Wellness", "Benessere", "العافية"],
  language: [
    "Reception languages",
    "接待语言",
    "Idiomas de atención",
    "Langues d’accueil",
    "Betreuungssprachen",
    "Lingue di accoglienza",
    "لغات الاستقبال",
  ],
  allLanguages: [
    "All languages",
    "全部语言",
    "Todos los idiomas",
    "Toutes les langues",
    "Alle Sprachen",
    "Tutte le lingue",
    "جميع اللغات",
  ],
  directions: [
    "Service areas",
    "服务方向",
    "Áreas de servicio",
    "Domaines de service",
    "Leistungsbereiche",
    "Ambiti di servizio",
    "مجالات الخدمة",
  ],
  directionSearch: [
    "Service area keyword",
    "服务方向关键词",
    "Palabra clave del servicio",
    "Mot-clé du service",
    "Suchwort zum Leistungsbereich",
    "Parola chiave del servizio",
    "كلمة مفتاحية لمجال الخدمة",
  ],
  appointment: [
    "Appointment process",
    "预约流程",
    "Proceso de cita",
    "Démarche de rendez-vous",
    "Terminvereinbarung",
    "Procedura di prenotazione",
    "إجراءات حجز الموعد",
  ],
  preparation: [
    "Preparation",
    "准备事项",
    "Preparación",
    "Préparation",
    "Vorbereitung",
    "Preparazione",
    "التحضير",
  ],
  fees: [
    "Fees and payment notes",
    "费用与支付说明",
    "Gastos y pago",
    "Frais et paiement",
    "Kosten und Zahlung",
    "Costi e pagamento",
    "التكاليف والدفع",
  ],
  foreignAcceptance: [
    "International visitor reception",
    "外籍访客接待",
    "Atención a visitantes extranjeros",
    "Accueil des visiteurs étrangers",
    "Betreuung ausländischer Besucher",
    "Accoglienza di visitatori stranieri",
    "استقبال الزوار الأجانب",
  ],
  confirmed: [
    "Reception confirmed, subject to conditions",
    "已确认接待，须符合条件",
    "Atención confirmada, sujeta a condiciones",
    "Accueil confirmé, sous conditions",
    "Betreuung bestätigt, vorbehaltlich Bedingungen",
    "Accoglienza confermata, soggetta a condizioni",
    "الاستقبال مؤكد وفق الشروط",
  ],
  pending: [
    "Reception awaiting verification",
    "接待能力待核实",
    "Atención pendiente de verificación",
    "Accueil à vérifier",
    "Betreuung noch zu prüfen",
    "Accoglienza da verificare",
    "الاستقبال بانتظار التحقق",
  ],
  paused: [
    "Institution enquiries paused",
    "机构咨询已暂停",
    "Consultas a esta institución suspendidas",
    "Demandes pour cet établissement suspendues",
    "Anfragen für diese Einrichtung pausiert",
    "Richieste per questa struttura sospese",
    "استفسارات هذه المؤسسة متوقفة مؤقتًا",
  ],
  acceptanceConditions: [
    "Reception conditions",
    "接待条件",
    "Condiciones de atención",
    "Conditions d’accueil",
    "Betreuungsbedingungen",
    "Condizioni di accoglienza",
    "شروط الاستقبال",
  ],
  interpretation: [
    "Interpretation arrangements",
    "翻译安排",
    "Organización de interpretación",
    "Organisation de l’interprétation",
    "Dolmetschvereinbarungen",
    "Organizzazione dell’interpretariato",
    "ترتيبات الترجمة الشفهية",
  ],
  qualification: [
    "Verification notes",
    "核验说明",
    "Notas de verificación",
    "Notes de vérification",
    "Prüfhinweise",
    "Note di verifica",
    "ملاحظات التحقق",
  ],
  official: [
    "Official institution website",
    "机构官方网站",
    "Sitio oficial de la institución",
    "Site officiel de l’établissement",
    "Offizielle Website der Einrichtung",
    "Sito ufficiale della struttura",
    "الموقع الرسمي للمؤسسة",
  ],
  sources: ["Sources", "资料来源", "Fuentes", "Sources", "Quellen", "Fonti", "المصادر"],
  details: [
    "View institution",
    "查看机构",
    "Ver institución",
    "Voir l’établissement",
    "Einrichtung ansehen",
    "Visualizza struttura",
    "عرض المؤسسة",
  ],
  enquire: [
    "Enquire through Hua",
    "通过华伴咨询",
    "Consultar a través de Hua",
    "Contacter Hua pour cette demande",
    "Über Hua anfragen",
    "Richiedi tramite Hua",
    "استفسر عبر هوا",
  ],
  projectEnquire: [
    "Enquire about this project for the institution",
    "咨询此机构相关服务",
    "Consultar este proyecto para la institución",
    "Demander ce service pour l’établissement",
    "Dieses Angebot für die Einrichtung anfragen",
    "Richiedi questo progetto per la struttura",
    "استفسر عن هذا المشروع للمؤسسة",
  ],
  empty: [
    "No published institutions match these filters.",
    "暂无符合条件的已发布机构。",
    "Ninguna institución publicada coincide con estos filtros.",
    "Aucun établissement publié ne correspond à ces filtres.",
    "Keine veröffentlichte Einrichtung entspricht diesen Filtern.",
    "Nessuna struttura pubblicata corrisponde ai filtri.",
    "لا توجد مؤسسات منشورة تطابق هذه المرشحات.",
  ],
  receptionNote: [
    "Pending verification does not mean visitors are refused. An empty language list does not mean all languages are supported.",
    "待核实不等于不接待；未列接待语言不代表支持所有语言。",
    "Pendiente de verificación no significa que se rechace a visitantes. Una lista de idiomas vacía no indica atención en todos los idiomas.",
    "Une vérification en attente ne signifie pas un refus d’accueil. Une liste de langues vide ne signifie pas que toutes sont proposées.",
    "Eine ausstehende Prüfung bedeutet keine Ablehnung. Eine leere Sprachliste bedeutet nicht, dass alle Sprachen unterstützt werden.",
    "La verifica in sospeso non indica un rifiuto. Un elenco vuoto non significa che siano supportate tutte le lingue.",
    "انتظار التحقق لا يعني رفض الزوار. وعدم إدراج لغات لا يعني دعم جميع اللغات.",
  ],
  disclaimer: [
    "Hua coordinates enquiries. Submission does not confirm an appointment, eligibility, availability, price or treatment outcome. Medical decisions remain with qualified professionals.",
    "华伴负责咨询协调。提交不代表预约、接待资格、可用性、价格或治疗效果已确认。医疗判断由具备资质的专业人员作出。",
    "Hua coordina consultas. El envío no confirma cita, elegibilidad, disponibilidad, precio ni resultados. Las decisiones médicas corresponden a profesionales cualificados.",
    "Hua coordonne les demandes. L’envoi ne confirme ni rendez-vous, ni admissibilité, ni disponibilité, ni prix, ni résultat. Les décisions médicales relèvent de professionnels qualifiés.",
    "Hua koordiniert Anfragen. Das Absenden bestätigt weder Termin, Eignung, Verfügbarkeit, Preis noch Behandlungsergebnis. Medizinische Entscheidungen treffen qualifizierte Fachkräfte.",
    "Hua coordina le richieste. L’invio non conferma appuntamento, idoneità, disponibilità, prezzo o esito terapeutico. Le decisioni mediche spettano a professionisti qualificati.",
    "تنسق هوا الاستفسارات. الإرسال لا يؤكد موعدًا أو أهلية أو توفرًا أو سعرًا أو نتيجة علاج. القرارات الطبية للمهنيين المؤهلين.",
  ],
} as const;
export type InstitutionCopyKey =
  | keyof typeof rows
  | "search"
  | "city"
  | "allCities"
  | "filter"
  | "reset"
  | "results"
  | "general"
  | "previous"
  | "next"
  | "pagination"
  | "skip"
  | "unknown"
  | "address"
  | "addressEn"
  | "audience"
  | "verified"
  | "unresolved"
  | "related"
  | "project";
const columns: Locale[] = ["en", "zh", "es", "fr", "de", "it", "ar"];
export function institutionText(locale: Locale, key: InstitutionCopyKey): string {
  if (key in rows) return rows[key as keyof typeof rows][columns.indexOf(locale)];
  return exhibitionCopy[locale][key as keyof typeof exhibitionCopy.en];
}
