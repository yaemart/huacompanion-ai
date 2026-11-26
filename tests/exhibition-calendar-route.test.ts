import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as calendar from "../src/lib/exhibition-calendar.ts";
import { emptyExhibition } from "../src/lib/exhibitions.ts";
import { isContentIdentifier } from "../src/lib/content-identifiers.ts";
import { isLocale } from "../src/lib/locales.ts";
import type { ContentBody } from "../src/lib/content-model.ts";
import { parseSiteLocales } from "../src/lib/site-locales.ts";

const file = new URL(
  "../src/app/(frontend)/api/public/exhibitions/calendar/route.ts",
  import.meta.url,
);
const fixture: ContentBody = {
  kind: "exhibition",
  locale: "en",
  contentKey: "calendar-fixture",
  slug: "calendar-fixture",
  title: "Public calendar fixture",
  blocks: [],
  sources: [],
  exhibition: {
    ...emptyExhibition(),
    status: "announced",
    startDate: "2090-01-30",
    endDate: "2090-02-02",
  },
};
function load(
  items: ContentBody[] = [fixture],
  fail = false,
  origin = "https://site.example.invalid",
) {
  assert.ok(existsSync(file), "actual calendar route must exist");
  let initialized = 0;
  const payload = {};
  const modules: Record<string, unknown> = {
    "@/lib/exhibition-calendar": calendar,
    "@/lib/content-identifiers": { isContentIdentifier },
    "@/lib/locales": { isLocale },
    "@/server/site-config": {
      isSiteLocale: (v: unknown) => isLocale(v) && parseSiteLocales("en,zh").includes(v),
    },
    "@/payload.config": {},
    payload: {
      getPayload: async () => {
        initialized++;
        if (fail) throw Error("PRIVATE_DATABASE_SENTINEL");
        return payload;
      },
    },
    "@/server/content/service": {
      listPublished: async (p: unknown, locale: string) => {
        assert.equal(p, payload);
        return items.filter((item) => item.locale === locale);
      },
    },
  };
  const context = {
    exports: {} as { GET: (r: Request) => Promise<Response> },
    require: (name: string) => {
      assert.ok(name in modules, "Unexpected route dependency: " + name);
      return modules[name];
    },
    Request,
    Response,
    URL,
    process: { env: { APP_URL: origin } },
  };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, context);
  return { get: context.exports.GET, initialized: () => initialized };
}
const request = (query = "locale=en&key=calendar-fixture") =>
  new Request("https://untrusted.example.invalid/api/public/exhibitions/calendar?" + query);
for (const query of [
  "",
  "locale=en",
  "key=calendar-fixture",
  "locale=ja&key=calendar-fixture",
  "locale=ar&key=calendar-fixture",
  "locale=en&key=../draft",
  "locale=en&key=UPPER",
])
  test("calendar route rejects invalid/inactive parameters before storage: " + query, async () => {
    const route = load();
    const response = await route.get(request(query));
    assert.equal(response.status, 400);
    assert.equal(route.initialized(), 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
test("calendar route downloads actual calendar data with safe headers and configured origin", async () => {
  const response = await load().get(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /^text\/calendar; charset=utf-8$/i);
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="exhibition-en-calendar-fixture.ics"',
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const text = (await response.text()).replace(/\r\n /g, "");
  assert.match(text, /SUMMARY:Public calendar fixture\r\n/);
  assert.match(text, /URL:https:\/\/site.example.invalid\/en\/exhibitions\/calendar-fixture\r\n/);
  assert.doesNotMatch(text, /untrusted.example.invalid/);
});
for (const items of [
  [],
  [{ ...fixture, kind: "guide" as const }],
  [{ ...fixture, locale: "zh" as const }],
])
  test("calendar route cannot expose a missing, wrong-kind or other-language snapshot", async () => {
    const response = await load(items).get(request());
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /Public calendar fixture/);
  });
for (const status of ["pending", "postponed", "cancelled"] as const)
  test("calendar route refuses a public " + status + " event", async () => {
    const response = await load([
      { ...fixture, exhibition: { ...fixture.exhibition!, status } },
    ]).get(request());
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
test("calendar route sanitizes a database exception", async () => {
  const response = await load([], true).get(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE_SENTINEL|stack|password/);
});
test("calendar route refuses invalid configured origin rather than using request host", async () => {
  const response = await load([fixture], false, "").get(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /untrusted.example.invalid/);
});
