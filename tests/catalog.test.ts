import { catalogCities, catalogLanguages } from "../src/lib/catalog-options.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCatalog,
  publicCatalog,
  parseCatalogSource,
  emptyCatalog,
  catalogPath,
  inquiryFormKey,
} from "../src/lib/catalog.ts";
test("catalog requires explicit fees and delivery fields before publication", () => {
  const c = emptyCatalog();
  assert.throws(() => validateCatalog("service-project", c, true));
  Object.assign(c, {
    categories: ["business"],
    cities: [{ code: "shanghai", name: "上海" }],
    languages: ["en"],
    audience: "Buyers",
    includes: "Translation",
    excludes: "Transport",
    process: "Confirm scope",
    deliverables: "Meeting notes",
    materials: "Agenda",
    bookingNotice: "Confirm in advance",
    duration: "By proposal",
    people: "By proposal",
    changes: "Confirm in proposal",
    fulfillment: "arranged",
  });
  assert.doesNotThrow(() => validateCatalog("service-project", c, true));
  c.price = {
    mode: "fixed",
    amount: 0,
    currency: "CNY",
    unit: "day",
    conditions: "Confirmed scope",
  };
  assert.throws(() => validateCatalog("service-project", c, true));
  c.price.amount = 100;
  assert.doesNotThrow(() => validateCatalog("service-project", c, true));
  c.fulfillment = "specified";
  assert.throws(() => validateCatalog("service-project", c, true));
  c.providerKeys = ["provider-a"];
  assert.doesNotThrow(() => validateCatalog("service-project", c, true));
});
test("catalog projection never includes internal data or query price amounts", () => {
  const c = publicCatalog({
    ...emptyCatalog(),
    privateProviderId: 12,
    phone: "secret",
    price: { mode: "quote", amount: 100, internalCost: 50 },
  } as any);
  assert.equal((c as any).privateProviderId, undefined);
  assert.equal((c as any).phone, undefined);
  assert.equal(c.price.amount, undefined);
});
test("source parsing only accepts public keys and rejects malformed selections", () => {
  assert.deepEqual(parseCatalogSource({ provider: "vendor-a", project: "visit-a" }), {
    provider: "vendor-a",
    project: "visit-a",
  });
  assert.throws(() => parseCatalogSource({ provider: 15 }));
  assert.throws(() => parseCatalogSource({ project: "../../internal" }));
  assert.deepEqual(parseCatalogSource(undefined), undefined);
  assert.equal(
    catalogPath({ kind: "service-project", locale: "en", slug: "visit" }),
    "/en/services/projects/visit",
  );
});

test("removing or changing a source starts a fresh inquiry session", () => {
  const selected = inquiryFormKey("en", "business", { provider: "vendor" });
  assert.notEqual(selected, inquiryFormKey("en", "business", undefined));
  assert.notEqual(selected, inquiryFormKey("en", "business", { provider: "other" }));
  assert.equal(selected, inquiryFormKey("en", "business", { provider: "vendor" }));
});

test("catalog only accepts the initial eight cities and seven service languages", () => {
  const c = emptyCatalog();
  c.cities = [{ code: "paris", name: "Paris" }];
  assert.throws(() => validateCatalog("provider-profile", c));
  c.cities = [{ code: "shanghai", name: "Shanghai" }];
  c.languages = ["ja"];
  assert.throws(() => validateCatalog("provider-profile", c));
  c.languages = ["zh", "en", "es", "fr", "de", "it", "ar"];
  assert.doesNotThrow(() => validateCatalog("provider-profile", c));
});

test("catalog option labels stay consistent across all website languages", () => {
  assert.deepEqual(
    catalogCities.map((c) => c.zh),
    ["上海", "北京", "广州", "深圳", "重庆", "杭州", "武汉", "南京"],
  );
  assert.deepEqual(
    catalogLanguages.map((l) => l.zh),
    ["中文", "英文", "西班牙文", "法文", "德文", "意大利文", "阿拉伯文"],
  );
  const c = emptyCatalog();
  c.cities = [{ code: "beijing", name: "Incorrect label" }];
  assert.equal(publicCatalog(c, "en").cities[0].name, "Beijing");
  assert.equal(publicCatalog(c, "zh").cities[0].name, "北京");
});

test("catalog projection localizes cities without inventing service languages", () => {
  const c = emptyCatalog();
  c.languages = ["zh", "en"];
  c.cities = [{ code: "beijing", name: "北京" }];
  for (const locale of ["zh", "en", "es", "fr", "de", "it", "ar"] as const) {
    const projected = publicCatalog(c, locale);
    assert.deepEqual(projected.languages, ["zh", "en"]);
    assert.equal(
      projected.cities[0].name,
      catalogCities.find((city) => city.code === "beijing")![locale],
    );
    for (const language of catalogLanguages) assert.ok(language[locale]);
  }
  assert.equal(publicCatalog(c, "ar").cities[0].name, "بكين");
});

test("exhibition selection accepts only valid revision and resets inquiry session", () => {
  assert.deepEqual(
    parseCatalogSource({ exhibition: "hardware-2027", exhibitionRevision: 4, forgedTitle: "fake" }),
    { exhibition: "hardware-2027", exhibitionRevision: 4 },
  );
  assert.throws(() => parseCatalogSource({ exhibition: "hardware-2027", exhibitionRevision: "4" }));
  assert.throws(() => parseCatalogSource({ project: "project", exhibitionRevision: 4 }));
  assert.notEqual(
    inquiryFormKey("en", "business", { exhibition: "hardware-2027", exhibitionRevision: 4 }),
    inquiryFormKey("en", "business", { exhibition: "hardware-2027", exhibitionRevision: 5 }),
  );
});
