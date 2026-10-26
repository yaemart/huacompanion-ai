import type { Locale } from "./routes.ts";
export type FormKind = "request" | "apply";
export type Values = Record<string, string | string[] | boolean>;
export function validateStep(
  kind: FormKind,
  step: number,
  values: Values,
  locale: Locale,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const en = locale === "en";
  const get = (k: string) =>
    typeof values[k] === "string" ? (values[k] as string).trim() : "";
  const require = (k: string) => {
    if (!get(k))
      errors[k] = en ? "Please complete this field." : "请填写此项。";
  };
  if (step === 0) {
    if (!Array.isArray(values.categories) || !values.categories.length)
      errors.categories = en
        ? "Choose at least one service."
        : "请至少选择一项服务。";
    require("city");
    if (kind === "apply") require("organisation");
  }
  if (step === 1 && kind === "request") {
    if (
      !/^\d+$/.test(get("people")) ||
      Number(get("people")) < 1 ||
      Number(get("people")) > 10000
    )
      errors.people = en
        ? "Enter a whole number from 1 to 10,000."
        : "请输入 1 至 10000 的整数。";
    if (!values.datesUnknown) {
      require("arrivalDate");
      if (get("arrivalDate") && !/^\d{4}-\d{2}-\d{2}$/.test(get("arrivalDate")))
        errors.arrivalDate = en ? "Enter a valid date." : "请填写有效日期。";
    }
    if (
      Array.isArray(values.categories) &&
      values.categories.includes("stays") &&
      values.stayType === "long"
    )
      require("leaseLength");
    if (
      Array.isArray(values.categories) &&
      values.categories.includes("stays") &&
      values.stayType === "short" &&
      get("checkIn") &&
      get("checkOut") &&
      get("checkOut") <= get("checkIn")
    )
      errors.checkOut = en
        ? "Check-out must be after check-in."
        : "退房日期须晚于入住日期。";
  }
  if (step === 1 && kind === "apply") {
    require("capabilities");
    require("languages");
  }
  if (step === 2) {
    require("name");
    require("email");
    if (get("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get("email")))
      errors.email = en ? "Enter a valid email address." : "请填写有效邮箱。";
    if (kind === "request") require("language");
    else require("phone");
  }
  if (step === 3 && values.consent !== true)
    errors.consent = en
      ? "Please read and acknowledge the notice."
      : "请阅读并确认告知事项。";
  return errors;
}

export function visibleReviewValues(values: Values): Values {
  const selected = Array.isArray(values.categories) ? values.categories : [];
  const groups: Record<string, string[]> = {
    business: ["industry", "purpose"],
    transport: ["flight", "pickup", "dropoff", "luggage"],
    stays: [
      "stayType",
      "checkIn",
      "checkOut",
      "area",
      "facilities",
      "leaseLength",
      "rentalNeeds",
    ],
    travel: ["destinations", "interests"],
    interpretation: ["interpretation"],
    arrival: ["arrivalHelp"],
    medical: ["medicalHelp"],
  };
  const hidden = new Set(
    Object.entries(groups)
      .filter(([category]) => !selected.includes(category))
      .flatMap(([, fields]) => fields),
  );
  if (values.datesUnknown) hidden.add("arrivalDate");
  for (const field of values.stayType === "long"
    ? ["checkIn", "checkOut"]
    : ["leaseLength", "rentalNeeds"])
    hidden.add(field);
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !hidden.has(key)),
  );
}

export function errorStep(
  kind: FormKind,
  errors: Record<string, string>,
): number {
  const keys = Object.keys(errors);
  if (keys.some((k) => ["categories", "city", "organisation"].includes(k)))
    return 0;
  const contact = [
    "name",
    "email",
    ...(kind === "apply"
      ? ["phone", "website"]
      : ["language", "contact", "channel"]),
  ];
  if (keys.some((k) => !contact.includes(k) && k !== "consent")) return 1;
  if (keys.some((k) => contact.includes(k))) return 2;
  return 3;
}
