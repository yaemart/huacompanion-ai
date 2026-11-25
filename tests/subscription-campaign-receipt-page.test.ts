import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/app/(frontend)/subscription-campaigns/page.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
for (const [label, frozen, draft, local, expected] of [
  ["no snapshot", null, true, true, 0],
  ["original frozen version", { current: true }, true, true, 0],
  ["revised original snapshot", { current: false }, true, true, 1],
  ["no selected draft", null, false, true, 0],
  ["non-local mode", { current: false }, true, false, 0],
] as const)
  test("receipt page skips needless query: " + label, async () => {
    let reads = 0;
    const modules: Record<string, unknown> = {
      "react/jsx-runtime": { jsx: (type: string, props: unknown) => ({ type, props }) },
      "next/headers": { headers: async () => ({}) },
      "next/navigation": {
        redirect: () => {
          throw Error("unexpected redirect");
        },
      },
      "@/server/content/error": { ContentError: class extends Error {} },
      "@/server/subscription-campaign-workspace": {
        campaignStaffAuth: async () => ({ p: {}, user: {} }),
        readCampaignWorkspace: async () => ({ grants: null }),
      },
      "@/server/subscription-campaign-drafts": {
        readCampaignDraft: async () => ({ campaignKey: "fixture", revision: 2 }),
      },
      "@/server/subscription-campaign-freeze": { readCampaignFreeze: async () => frozen },
      "@/server/subscription-campaign-mock-checks": {
        campaignMockChecks: async () => ({ enabled: local }),
      },
      "@/server/subscription-campaign-control": { readCampaignPause: async () => ({}) },
      "@/server/subscription-campaign-task-options": { readCampaignMockSlots: async () => [] },
      "@/server/subscription-campaign-status": { readCampaignTaskStatus: async () => ({}) },
      "@/server/subscription-campaign-review": { readCampaignReviewDetails: async () => ({}) },
      "@/server/subscription-campaign-revision-preflight": {
        readCampaignRevisionPreflight: async () => ({}),
      },
      "@/server/subscription-campaign-continuation-read": {
        readCampaignContinuation: async () => {
          reads++;
          return null;
        },
      },
      "@/components/subscriptions/CampaignWorkspace": { CampaignWorkspace: "workspace" },
      "@/components/subscriptions/management.css": {},
    };
    const context = {
      exports: {} as Record<string, unknown>,
      process: { env: { APP_ENV: local ? "local" : "trial" } },
      require: (name: string) => modules[name],
    };
    runInNewContext(source, context);
    await (context.exports.default as (props: object) => Promise<unknown>)({
      searchParams: Promise.resolve(draft ? { campaign: "fixture" } : {}),
    });
    assert.equal(reads, expected);
  });
