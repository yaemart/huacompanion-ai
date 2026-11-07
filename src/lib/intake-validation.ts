import { homeRequestFields, homeProviderFields } from "./housekeeping.ts";
import { isLocale, type Locale } from "./locales.ts";
import { parseCatalogSource, type CatalogSource } from "./catalog.ts";
import { validateStep, visibleReviewValues, type Values, type FormKind } from "./forms.ts";
import { serviceSlugs } from "./routes.ts";
export class IntakeValidationError extends Error {
  errors: Record<string, string>;
  constructor(errors: Record<string, string>) {
    super("Invalid intake");
    this.errors = errors;
  }
}
const common = ["name", "email", "city"];
const requestFields = [
  ...homeRequestFields,
  "people",
  "arrivalDate",
  "industry",
  "purpose",
  "flight",
  "pickup",
  "dropoff",
  "luggage",
  "stayType",
  "checkIn",
  "checkOut",
  "area",
  "facilities",
  "leaseLength",
  "rentalNeeds",
  "destinations",
  "interests",
  "interpretation",
  "arrivalHelp",
  "medicalHelp",
  "budget",
  "description",
  "language",
  "contact",
  "channel",
];
const providerFields = [
  ...homeProviderFields,
  "organisation",
  "phone",
  "website",
  "languages",
  "capabilities",
  "hours",
  "cooperation",
  "qualification",
  "notes",
];
export function parseIntake(input: unknown): {
  kind: FormKind;
  locale: Locale;
  values: Values;
  source?: CatalogSource;
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new IntakeValidationError({ form: "Invalid payload" });
  const body = input as Record<string, unknown>;
  if (body.kind !== "request" && body.kind !== "apply")
    throw new IntakeValidationError({ kind: "Invalid form" });
  if (!isLocale(body.locale)) throw new IntakeValidationError({ locale: "Invalid language" });
  if (!body.values || typeof body.values !== "object" || Array.isArray(body.values))
    throw new IntakeValidationError({ values: "Invalid values" });
  let source: CatalogSource | undefined;
  try {
    source = parseCatalogSource(body.source);
    if (source && body.kind !== "request") throw Error();
  } catch {
    throw new IntakeValidationError({ source: "Invalid service selection" });
  }
  const raw = body.values as Record<string, unknown>;
  let values: Values = {};
  const errors: Record<string, string> = {};
  for (const key of [...common, ...(body.kind === "request" ? requestFields : providerFields)]) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 2000) {
      errors[key] = "Invalid or oversized value";
      continue;
    }
    values[key] = value.trim();
  }
  if (typeof raw.consent !== "boolean") errors.consent = "Consent must be a boolean";
  else values.consent = raw.consent;
  if (raw.datesUnknown !== undefined && typeof raw.datesUnknown !== "boolean")
    errors.datesUnknown = "Invalid date flag";
  else values.datesUnknown = raw.datesUnknown === true;
  if (
    !Array.isArray(raw.categories) ||
    !raw.categories.length ||
    raw.categories.length > serviceSlugs.length ||
    raw.categories.some((x) => typeof x !== "string" || !serviceSlugs.includes(x))
  )
    errors.categories = "Invalid service selection";
  else values.categories = [...new Set(raw.categories)];
  values = visibleReviewValues(values);
  for (const key of ["arrivalDate", "checkIn", "checkOut"]) {
    const d = values[key];
    if (typeof d === "string" && d) {
      const date = new Date(d + "T00:00:00Z");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== d
      )
        errors[key] = "Invalid date";
    }
  }
  if (values.stayType && !["short", "long"].includes(String(values.stayType)))
    errors.stayType = "Invalid stay type";
  if (typeof values.email === "string") {
    values.email = values.email.toLowerCase();
    if (values.email.length > 254) errors.email = "Email too long";
  }
  for (let i = 0; i < 4; i++)
    Object.assign(errors, validateStep(body.kind, i, values, body.locale));
  if (Object.keys(errors).length) throw new IntakeValidationError(errors);
  return {
    kind: body.kind,
    locale: body.locale,
    values: visibleReviewValues(values),
    ...(source ? { source } : {}),
  };
}
