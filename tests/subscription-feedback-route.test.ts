import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
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
  const response = await (ctx.exports.POST as (r: Request) => Promise<Response>)(
    new Request("http://fictional.invalid", { method: "POST", body: "{}" }),
  );
  assert.equal(response.status, 401);
  assert.equal(databases, 0);
});
