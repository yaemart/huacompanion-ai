import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { coreText } from "../src/lib/core-copy.ts";
import {
  customerCopy,
  customerStatus,
  customerNotificationCopy,
} from "../src/lib/customer-copy.ts";
import { homeText, homePair } from "../src/lib/housekeeping-copy.ts";
import { institutionText, type InstitutionCopyKey } from "../src/lib/institution-copy.ts";
import { lifeText } from "../src/lib/lifestyle-copy.ts";
import { supportText } from "../src/lib/support-copy.ts";
import { voiceCopy } from "../src/lib/voice-copy.ts";

const contract = JSON.parse(
  readFileSync(new URL("./fixtures/copy-contract.json", import.meta.url), "utf8"),
) as Record<string, { keys: string[]; hash: string }>;
const locales = ["en", "zh", "es", "fr", "de", "it", "ar"] as const;
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]),
    );
  return value;
};
const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(normalize(value)))
    .digest("hex");
const output = (name: string, keys: string[]) =>
  locales.map((locale) => {
    if (name === "core") return keys.map((key) => coreText(locale, key));
    if (name === "customer")
      return [customerCopy(locale), customerStatus[locale], customerNotificationCopy[locale]];
    if (name === "housekeeping") return keys.map((key) => [homeText(locale, key), homePair(key)]);
    if (name === "institution")
      return keys.map((key) => institutionText(locale, key as InstitutionCopyKey));
    if (name === "lifestyle") return keys.map((key) => lifeText(locale, key));
    if (name === "support") return keys.map((key) => supportText(locale, key));
    if (name === "voice") return voiceCopy(locale);
    throw Error(`Unknown contract: ${name}`);
  });

for (const [name, expected] of Object.entries(contract)) {
  test(`${name} authored copy retains every original character in seven locales`, () => {
    assert.equal(digest(output(name, expected.keys)), expected.hash);
  });
}

test("copy data has language and named field objects instead of positional translation arrays", () => {
  for (const name of [
    "core",
    "customer",
    "housekeeping",
    "institution",
    "lifestyle",
    "support",
    "voice",
  ]) {
    const source = readFileSync(new URL(`../src/lib/${name}-copy.ts`, import.meta.url), "utf8");
    assert.ok(!/:\s*\[\s*["']/u.test(source), `${name}: positional authored translation array`);
  }
});

test("unknown copy keys and support locales retain their original fallback", () => {
  for (const key of ["missing-copy-key", "toString", "constructor", "__proto__"]) {
    assert.equal(homeText("en", key), key);
    assert.equal(lifeText("en", key), key);
    assert.equal(supportText("en", key), key);
    assert.equal(institutionText("en", key as InstitutionCopyKey), undefined);
  }
  for (const locale of ["unknown", "toString", "constructor", "__proto__"]) {
    assert.equal(supportText(locale, "title"), supportText("en", "title"));
  }
  const first = voiceCopy("en");
  const second = voiceCopy("en");
  assert.notEqual(first, second);
});
