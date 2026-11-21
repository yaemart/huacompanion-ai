import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import {
  claimMockCampaignTask,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.APP_ENV, "local");
assert.equal(process.env.HUA_DEMO_SCHEMA_PUSH, "false");
assert.equal(url.protocol, "postgresql:");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(!url.search && !url.hash && /^\/hua_subscriptions_[a-f0-9]{32}$/.test(url.pathname));
assert.ok(
  (url.port === "55442" && url.username === "hua_demo") ||
    (process.env.GITHUB_ACTIONS === "true" && url.port === "55438" && url.username === "hua"),
);
const p = await getPayload({ config });
process.on("message", async (message: { actorId: number; action: string; input: unknown }) => {
  try {
    const actor = await p.findByID({ collection: "staff", id: message.actorId, depth: 0 });
    assert.ok(["claim", "complete"].includes(message.action));
    const work = message.action === "claim" ? claimMockCampaignTask : completeMockCampaignTask;
    process.send!({ pid: process.pid, report: await work(p, actor, message.input) });
  } catch (error) {
    process.send!({ pid: process.pid, error: (error as { status?: number }).status ?? 500 });
  }
});
process.send!({ ready: true, pid: process.pid });
