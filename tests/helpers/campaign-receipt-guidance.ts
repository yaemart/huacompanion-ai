import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import type { Staff } from "../../src/cms/access";
import { CampaignWorkspace } from "../../src/components/subscriptions/CampaignWorkspace";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { readCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignFreeze } from "../../src/server/subscription-campaign-freeze";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { readCampaignPause } from "../../src/server/subscription-campaign-control";
import { readCampaignRevisionPreflight } from "../../src/server/subscription-campaign-revision-preflight";
import { readCampaignContinuation } from "../../src/server/subscription-campaign-continuation-read";

export async function assertReceiptGuidance(
  p: Payload,
  actor: Staff,
  input: { campaignKey: string; revision: number },
) {
  const props = {
    workspace: await readCampaignWorkspace(p, actor),
    draft: await readCampaignDraft(p, actor, input.campaignKey),
    frozen: await readCampaignFreeze(p, actor, input),
    checks: await campaignMockChecks(p, actor, "status", input),
    pause: await readCampaignPause(p, actor, input),
    revisionPreflight: await readCampaignRevisionPreflight(p, actor, input),
    continuation: await readCampaignContinuation(p, actor, input),
    taskSlots: [],
  };
  const render = (value = props) => renderToStaticMarkup(createElement(CampaignWorkspace, value));
  const section = (markup: string) => {
    const found = markup.match(
      /<section[^>]*aria-label="同一活动改版续发预检"[^]*?<\/section>/,
    )?.[0];
    assert.ok(found);
    return found;
  };
  const markup = render();
  if (!props.frozen) {
    assert.match(section(markup), /先保存、模拟确认并冻结原名单/);
    assert.doesNotMatch(markup, /aria-label="本版本地续发"/);
  } else if (props.frozen.current) {
    assert.match(section(markup), /原冻结版本，无须改版续发/);
    assert.doesNotMatch(markup, /aria-label="本版本地续发"/);
  } else if (!props.continuation) {
    assert.match(section(markup), /当前页尚未载入.*入口勾选确认/);
    assert.match(markup, /提交本版续发（不发送）/);
  } else {
    assert.match(section(markup), /本版续发范围已保存/);
    assert.doesNotMatch(section(markup), /入口勾选确认/);
    assert.doesNotMatch(markup, /提交本版续发（不发送）/);
  }
  if (props.frozen && !props.frozen.current) {
    const paused = render({ ...props, pause: { ...props.pause, paused: true } });
    assert.match(section(paused), /活动已暂停/);
    assert.doesNotMatch(section(paused), /可在上方/);
    const cancelled = render({
      ...props,
      pause: { ...props.pause, cancelledAt: new Date().toISOString() },
    });
    assert.match(section(cancelled), /活动已取消/);
    assert.doesNotMatch(section(cancelled), /可在上方/);
    const resumed = render({
      ...props,
      revisionPreflight: { ...props.revisionPreflight, blockers: ["paused" as const] },
    });
    assert.match(section(resumed), /活动已恢复.*刷新预检/);
  }
}
