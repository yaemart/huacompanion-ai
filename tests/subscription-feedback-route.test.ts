import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import {
  verifyFeedbackSignature,
  parseFeedbackEvent,
} from "../src/lib/subscription-feedback-webhook.ts";
const code = ts.transpileModule(
  readFileSync(
    new URL("../src/app/(frontend)/api/subscriptions/campaign-feedback/route.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
test("invalid signature cannot initialize a database or trigger local schema push", async () => {
  let databases = 0;
  class ContentError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  const modules: Record<string, unknown> = {
    payload: {
      getPayload: async () => {
        databases++;
        throw Error("must not initialize database");
      },
    },
    "@/payload.config": { default: {} },
    "@/server/content/auth": {
      limitedBody: async (req: Request) => Buffer.from(await req.arrayBuffer()),
    },
    "@/server/content/error": { ContentError },
    "@/server/subscription-campaign-feedback": {
      recordSignedCampaignFeedback: async () => {
        throw new ContentError("invalid", 401);
      },
    },
    "@/lib/subscription-feedback-webhook": { verifyFeedbackSignature, parseFeedbackEvent },
  };
  const ctx = {
    exports: {} as Record<string, unknown>,
    require: (name: string) => modules[name],
    Response,
    Buffer,
    process: {
      env: {
        APP_ENV: "local",
        SUBSCRIPTION_FEEDBACK_ENABLED: "true",
        SUBSCRIPTION_FEEDBACK_SIGNING_SECRET: "whsec_" + Buffer.alloc(32).toString("base64"),
      },
    },
  };
  runInNewContext(code, ctx);
  // Exercise the method table used by the installed Next app-route dispatcher, with this real route's exports.
  const { autoImplementMethods } = createRequire(import.meta.url)(
    "next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js",
  );
  const methods = autoImplementMethods(ctx.exports);
  for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
    const denied = await methods[method](new Request("http://fictional.invalid", { method }));
    assert.equal(denied.status, 405);
    assert.equal(databases, 0);
  }
  assert.equal(methods.POST, ctx.exports.POST);
  const response = await (ctx.exports.POST as (r: Request) => Promise<Response>)(
    new Request("http://fictional.invalid", { method: "POST", body: "{}" }),
  );
  assert.equal(response.status, 401);
  assert.equal(databases, 0);
});
