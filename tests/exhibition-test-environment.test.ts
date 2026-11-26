import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseSiteLocales } from "../src/lib/site-locales.ts";
const api = await import("./helpers/exhibition-test-environment.ts").catch(() => null);
const ci = {
  APP_ENV: "local",
  DATABASE_URL: "postgresql://hua:fictional@127.0.0.1:55438/hua_companion",
};
const random = "postgresql://hua_demo:fictional@127.0.0.1:55442/hua_exhibitions_" + "a".repeat(32);
test("exhibition fixture database guard exists", () =>
  assert.ok(api?.assertExhibitionTestDatabase));
for (const DATABASE_URL of [ci.DATABASE_URL, random])
  test("accepts only a dedicated fixture database " + new URL(DATABASE_URL).pathname, () =>
    assert.doesNotThrow(() => api!.assertExhibitionTestDatabase({ ...ci, DATABASE_URL })),
  );
for (const [label, env] of [
  ["production", { ...ci, APP_ENV: "production" }],
  [
    "existing demo",
    { ...ci, DATABASE_URL: random.replace(/hua_exhibitions_.*/, "hua_companion_demo") },
  ],
  ["other host", { ...ci, DATABASE_URL: random.replace("127.0.0.1", "example.invalid") }],
  ["other user", { ...ci, DATABASE_URL: random.replace("hua_demo:", "other:") }],
  ["other port", { ...ci, DATABASE_URL: random.replace("55442", "5432") }],
  ["invalid random name", { ...ci, DATABASE_URL: random.slice(0, -1) }],
  ["query options", { ...ci, DATABASE_URL: random + "?options=anything" }],
  ["fragment", { ...ci, DATABASE_URL: random + "#test" }],
  ["non database protocol", { ...ci, DATABASE_URL: random.replace("postgresql:", "http:") }],
  ["missing URL", { APP_ENV: "local" }],
] as const)
  test("rejects " + label, () => assert.throws(() => api!.assertExhibitionTestDatabase(env)));
for (const file of ["exhibitions.ts", "exhibitions-http.ts"])
  for (const [allowed, DATABASE_URL] of [
    [false, random.replace(/hua_exhibitions_.*/, "hua_companion_demo")],
    [true, ci.DATABASE_URL],
  ] as const)
    test(file + " checks the database before Payload initialization: " + allowed, async () => {
      const code = ts.transpileModule(
        readFileSync(new URL("./integration/" + file, import.meta.url), "utf8"),
        {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        },
      ).outputText;
      let databases = 0;
      const env = { APP_ENV: "local", DATABASE_URL, APP_URL: "http://127.0.0.1:3000" };
      const modules: Record<string, unknown> = {
        payload: {
          getPayload: async () => {
            databases++;
            throw Error("payload sentinel");
          },
        },
        "../helpers/exhibition-test-environment": {
          assertExhibitionTestDatabase: () => api!.assertExhibitionTestDatabase(env),
        },
        "../../src/lib/site-locales": { parseSiteLocales },
      };
      const run = runInNewContext("(async()=>{" + code + "})()", {
        exports: {},
        require: (name: string) => modules[name] ?? {},
        URL,
        process: { env },
      });
      await assert.rejects(run, allowed ? /payload sentinel/ : /dedicated test database/);
      assert.equal(databases, allowed ? 1 : 0);
    });
