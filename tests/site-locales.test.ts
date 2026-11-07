import test from "node:test";
import assert from "node:assert/strict";
import { parseSiteLocales, publicFeatures } from "../src/lib/site-locales.ts";
import { locales, isLocale } from "../src/lib/locales.ts";

test("public locales default to English then Chinese while retaining seven-language support", () => {
  assert.deepEqual(parseSiteLocales(undefined), ["en", "zh"]);
  assert.equal(locales.length, 7);
  assert.equal(isLocale("ar"), true);
  assert.deepEqual(parseSiteLocales("zh,en,es,fr,de,it,ar"), locales);
  assert.deepEqual(parseSiteLocales(" en , zh ,fr "), ["en", "zh", "fr"]);
});

test("explicit invalid, empty, duplicated or incomplete public locale configuration is rejected", () => {
  for (const value of ["", " ", "zh", "en", "zh,en,ja", "zh,en,", "zh,,en", "zh,en,en"])
    assert.throws(() => parseSiteLocales(value), /SITE_LOCALES/);
});

test("public feature projection fails closed and exposes only booleans", () => {
  assert.deepEqual(publicFeatures(undefined, undefined), {
    customerCenter: false,
    textChat: false,
  });
  assert.deepEqual(
    publicFeatures(
      Object.assign({ enabled: true }, { secret: "private" }),
      Object.assign({ textChat: true }, { secret: "private" }),
    ),
    {
      customerCenter: true,
      textChat: true,
    },
  );
  assert.deepEqual(publicFeatures({ enabled: "true" }, { textChat: undefined }), {
    customerCenter: false,
    textChat: false,
  });
});
