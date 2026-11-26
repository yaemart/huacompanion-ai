import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyExhibition, publicExhibition, validateExhibition } from "../src/lib/exhibitions.ts";
import { validateContent } from "../src/lib/content-model.ts";
import type { ContentBody } from "../src/lib/content-model.ts";
const api = await import("../src/lib/exhibition-next-edition.ts").catch(() => null);
const today = "2026-11-26";
const event = (key: string, startDate = "2020-01-01", endDate = "2020-01-03"): ContentBody => ({
  kind: "exhibition",
  locale: "en",
  contentKey: key,
  slug: key,
  title: "Fictional " + key,
  blocks: [],
  sources: [],
  exhibition: { ...emptyExhibition(), status: "announced", startDate, endDate },
});
const source = () => ({
  ...event("old-fair"),
  exhibition: { ...event("old-fair").exhibition!, nextEditionKey: "next-fair" },
});
const next = () => event("next-fair", "2090-01-01", "2090-01-03");
test("legacy exhibition without next key remains valid and projection does not mutate it", () => {
  const old = event("legacy");
  delete old.exhibition!.nextEditionKey;
  const before = JSON.stringify(old);
  validateContent(old);
  assert.equal(publicExhibition(old.exhibition!).nextEditionKey, "");
  assert.equal(JSON.stringify(old), before);
});
for (const key of [null, 123, "../draft", "UPPER", "x".repeat(101), "-bad"])
  test("exhibition rejects malformed next key " + String(key).slice(0, 12), () => {
    const value = { ...emptyExhibition(), nextEditionKey: key };
    assert.throws(() => validateExhibition(value as never), /下一届/);
  });
test("saved content rejects a self-reference with actionable feedback", () => {
  const body = source();
  body.exhibition.nextEditionKey = body.contentKey;
  assert.throws(() => validateContent(body), /下一届.*自己/);
});
test("public exhibition copies only next key and drops unknown fields", () => {
  const result = publicExhibition({ ...source().exhibition, privateNextDraft: "private" } as never);
  assert.equal(result.nextEditionKey, "next-fair");
  assert.equal("privateNextDraft" in result, false);
});
test("ended source resolves only its directly selected same-language future public target", () => {
  assert.ok(api);
  assert.equal(api.resolveNextEdition(source(), [next()], today)?.contentKey, "next-fair");
  assert.equal(api.resolveNextEdition(source(), [], today), undefined);
  assert.equal(api.resolveNextEdition(source(), [{ ...next(), locale: "zh" }], today), undefined);
  assert.equal(api.resolveNextEdition(source(), [{ ...next(), kind: "guide" }], today), undefined);
});
test("current or unconfirmed historical sources do not show a next-edition section", () => {
  assert.ok(api);
  assert.equal(
    api.resolveNextEdition(
      { ...source(), exhibition: { ...source().exhibition, endDate: today } },
      [next()],
      today,
    ),
    undefined,
  );
  assert.equal(
    api.resolveNextEdition({ ...source(), calendarExportable: false }, [next()], today),
    undefined,
  );
  assert.equal(
    api.resolveNextEdition(
      { ...source(), exhibition: { ...source().exhibition, status: "pending" } },
      [next()],
      today,
    ),
    undefined,
  );
});
test("malformed historical source dates do not create a next-edition link", () => {
  assert.ok(api);
  const bad = { ...source(), exhibition: { ...source().exhibition, startDate: "2020-02-30" } };
  assert.equal(api.resolveNextEdition(bad, [next()], today), undefined);
});
for (const status of ["pending", "postponed"] as const)
  test("next edition accepts a published " + status + " announcement with unknown dates", () => {
    assert.ok(api);
    const target = {
      ...next(),
      exhibition: { ...next().exhibition!, status, startDate: "", endDate: "" },
    };
    assert.equal(api.isNextEditionTarget(source(), target, today), true);
    assert.equal(api.resolveNextEdition(source(), [target], today)?.contentKey, "next-fair");
  });
for (const target of [
  { ...next(), exhibition: { ...next().exhibition!, status: "cancelled" as const } },
  { ...next(), exhibition: { ...next().exhibition!, status: "ended" as const } },
  event("next-fair"),
  { ...next(), contentKey: "old-fair" },
  { ...next(), locale: "zh" as const },
  { ...next(), kind: "guide" as const },
  event("next-fair", "2020-01-03", "2090-01-03"),
  event("next-fair", "2090-02-30", "2090-03-02"),
  event("next-fair", "", ""),
  {
    ...event("next-fair"),
    exhibition: { ...event("next-fair").exhibition!, status: "pending" as const },
  },
])
  test(
    "next edition refuses invalid or obsolete target " + JSON.stringify(target.exhibition),
    () => {
      assert.ok(api);
      assert.equal(api.isNextEditionTarget(source(), target, today), false);
      assert.equal(api.resolveNextEdition(source(), [target], today), undefined);
    },
  );
test("publication rejects missing/other-language targets and a public relationship cycle", () => {
  assert.ok(api);
  assert.throws(() => api.validateNextEditionPublication(source(), []), /下一届/);
  assert.throws(
    () => api.validateNextEditionPublication(source(), [{ ...next(), locale: "zh" }]),
    /下一届/,
  );
  const cyclic = { ...next(), exhibition: { ...next().exhibition!, nextEditionKey: "old-fair" } };
  assert.throws(() => api.validateNextEditionPublication(source(), [source(), cyclic]), /回环/);
});
test("publication permits a forward unknown-date chain without following it for display", () => {
  assert.ok(api);
  const target = { ...next(), exhibition: { ...next().exhibition!, nextEditionKey: "third-fair" } };
  assert.doesNotThrow(() =>
    api.validateNextEditionPublication(source(), [
      target,
      event("third-fair", "2091-01-01", "2091-01-03"),
    ]),
  );
  assert.equal(api.resolveNextEdition(source(), [target], today)?.contentKey, "next-fair");
});
