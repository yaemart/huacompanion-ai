import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formCopy, formText, type FormCopyKey } from "../src/lib/form-copy.ts";
import { locales, localeNames } from "../src/lib/locales.ts";
import { validateStep } from "../src/lib/forms.ts";

test("every form message has explicit copy for all seven locales", () => {
  assert.equal(Object.keys(formCopy).length, 106);
  for (const [key, copy] of Object.entries(formCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), [...locales].sort(), key);
    for (const locale of locales) assert.ok(copy[locale].trim(), `${key}: ${locale}`);
    assert.match(copy.ar, /[\u0600-\u06ff]/, key);
  }
  const component = readFileSync(new URL("../src/components/InquiryForm.tsx", import.meta.url), "utf8");
  for (const match of component.matchAll(/\bc\(\s*"([^"\n]+)"/g)) {
    assert.ok(match[1] in formCopy, `Untranslated form message: ${match[1]}`);
  }
});

test("all validation branches display the selected language while retaining field keys", () => {
  for (const locale of locales) {
    const t = (key: FormCopyKey) => formText(locale, key);
    assert.deepEqual(validateStep("apply", 0, {}, locale), {
      categories: t("Choose at least one service."),
      city: t("Please complete this field."),
      organisation: t("Please complete this field."),
    });
    assert.deepEqual(validateStep("request", 1, { people: "0", arrivalDate: "bad", categories: ["stays"], stayType: "short", checkIn: "2026-10-28", checkOut: "2026-10-27" }, locale), {
      people: t("Enter a whole number from 1 to 10,000."),
      arrivalDate: t("Enter a valid date."),
      checkOut: t("Check-out must be after check-in."),
    });
    assert.deepEqual(validateStep("request", 2, { name: "Test", email: "invalid", language: localeNames[locale] }, locale), { email: t("Enter a valid email address.") });
    assert.deepEqual(validateStep("request", 3, {}, locale), { consent: t("Please read and acknowledge the notice.") });
    assert.deepEqual(validateStep("request", 2, { name: "Test", email: "test@example.com", language: localeNames[locale] }, locale), {});
  }
});
