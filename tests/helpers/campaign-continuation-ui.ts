import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import type { Staff } from "../../src/cms/access";
import type { ContinuationReceipt } from "../../src/lib/subscription-campaign-continuation-client";
import { CampaignWorkspace } from "../../src/components/subscriptions/CampaignWorkspace";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { readCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignFreeze } from "../../src/server/subscription-campaign-freeze";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { readCampaignPause } from "../../src/server/subscription-campaign-control";

export async function assertContinuationUI(
  p: Payload,
  actor: Staff,
  draft: { campaignKey: string; revision: number },
  receipt: ContinuationReceipt,
) {
  const module = await import("../../src/components/subscriptions/CampaignContinuation").catch(
    () => null,
  );
  assert.ok(
    module?.CampaignContinuation,
    "the revised campaign needs an explicit local continuation panel",
  );
  const panel = (eligible: boolean, initial: ContinuationReceipt | null = null) =>
    renderToStaticMarkup(
      createElement(module.CampaignContinuation, {
        draft,
        initial,
        eligible,
        disabled: false,
        onBusyChange: () => {},
        onUncertainChange: () => {},
      }),
    );
  const disabled = panel(false);
  assert.match(disabled, /disabled=""/);
  assert.match(disabled, /仅为原名单.*从未尝试/);
  assert.doesNotMatch(panel(true), /name="confirmed"[^>]*checked/);
  assert.match(panel(true, receipt), /已保存本版续发范围/);
  assert.doesNotMatch(panel(true, receipt), /提交本版续发/);
  const props = {
    workspace: await readCampaignWorkspace(p, actor),
    draft: await readCampaignDraft(p, actor, draft.campaignKey),
    frozen: await readCampaignFreeze(p, actor, draft),
    checks: await campaignMockChecks(p, actor, "status", draft),
    pause: await readCampaignPause(p, actor, draft),
    taskSlots: [],
    continuation: receipt as ContinuationReceipt | null,
  };
  assert.equal(props.frozen!.current, false, "original frozen version stays original");
  const form = (value: typeof props) => {
    const html = renderToStaticMarkup(createElement(CampaignWorkspace, value));
    return (
      html.match(
        /<fieldset[^>]*><legend>为当前第[^]*?准备一个任务占位<\/button><\/fieldset>/,
      )?.[0] ?? ""
    );
  };
  assert.ok(form(props));
  assert.doesNotMatch(form(props), /^<fieldset disabled/);
  assert.match(form({ ...props, continuation: null }), /^<fieldset disabled/);
  assert.match(
    form({ ...props, checks: { ...props.checks, mockConfirmed: false } }),
    /^<fieldset disabled/,
  );
  assert.match(form({ ...props, pause: { ...props.pause, paused: true } }), /^<fieldset disabled/);
  assert.match(
    form({ ...props, pause: { ...props.pause, cancelledAt: new Date().toISOString() } }),
    /^<fieldset disabled/,
  );
}
