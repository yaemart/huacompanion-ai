import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contentPublishReason,
  ownReviewReason,
  policyActionReasons,
  quoteDecisionReasons,
  quoteSendReason,
} from "../src/lib/staff-action-reasons.ts";

test("content publish explains current review status, separation of duties and verification", () => {
  const ready = { busy: false, waiting: true, own: false, isAdmin: false, reason: "" };
  assert.equal(contentPublishReason(ready), undefined);
  assert.match(contentPublishReason({ ...ready, waiting: false })!, /提交审核/);
  assert.match(contentPublishReason({ ...ready, own: true })!, /另一位审核员/);
  assert.match(contentPublishReason({ ...ready, own: true, isAdmin: true })!, /填写.*原因/);
  assert.equal(
    contentPublishReason({ ...ready, own: true, isAdmin: true, reason: "说明" }),
    undefined,
  );
  assert.match(contentPublishReason({ ...ready, unchecked: "展期和报名条件" })!, /勾选.*展期/);
  assert.equal(ownReviewReason(false, false, ""), undefined);
});

const policy = {
  saving: false,
  canEdit: true,
  canReview: true,
  waiting: false,
  dirty: false,
  saved: true,
  own: false,
  isAdmin: false,
  reason: "",
  checked: false,
  published: true,
};

test("policy operator can find why a draft cannot be sent or why an existing version cannot be removed", () => {
  assert.equal(policyActionReasons(policy).submit, undefined);
  assert.match(policyActionReasons({ ...policy, saved: false }).submit!, /保存草稿/);
  assert.match(policyActionReasons({ ...policy, dirty: true }).submit!, /保存当前修改/);
  assert.match(policyActionReasons({ ...policy, waiting: true }).save!, /退回/);
  assert.match(policyActionReasons({ ...policy, published: false }).unpublish!, /尚无已发布版本/);
  assert.match(policyActionReasons({ ...policy, canReview: false }).publish!, /审核权限/);
});

test("policy review explains return reason, verification checkbox and changes to shared facts", () => {
  const pending = { ...policy, waiting: true, checked: true };
  assert.equal(policyActionReasons(pending).publish, undefined);
  assert.match(policyActionReasons(pending).return!, /填写退回原因/);
  assert.equal(policyActionReasons({ ...pending, reason: "原文需要复核" }).return, undefined);
  assert.match(policyActionReasons({ ...pending, checked: false }).publish!, /勾选/);
  assert.match(policyActionReasons({ ...pending, own: true }).publish!, /另一位审核员/);
  assert.match(
    policyActionReasons({ ...policy, note: { hasFacts: false, currentBasis: true } }).submit!,
    /先发布/,
  );
  assert.match(
    policyActionReasons({ ...pending, note: { hasFacts: true, currentBasis: false } }).publish!,
    /最新事实/,
  );
});

test("quote approval and return share role requirements but only approval needs per-line confirmations", () => {
  const ready = {
    busy: false,
    author: false,
    exception: false,
    reason: "已核对",
    missingDifference: false,
    missingCollection: false,
  };
  assert.deepEqual(quoteDecisionReasons(ready), { approve: undefined, reject: undefined });
  const missing = quoteDecisionReasons({ ...ready, missingDifference: true });
  assert.match(missing.approve!, /逐项勾选/);
  assert.equal(missing.reject, undefined);
  assert.match(
    quoteDecisionReasons({ ...ready, missingCollection: true }).approve!,
    /华伴代收确认/,
  );
  assert.match(quoteDecisionReasons({ ...ready, author: true }).reject!, /勾选.*自审例外/);
  assert.match(quoteDecisionReasons({ ...ready, reason: " " }).approve!, /填写审核意见/);
  assert.match(quoteDecisionReasons({ ...ready, busy: true }).approve!, /正在处理/);
});

test("quote send explains review, rejection and resubmission and permits an approved quote", () => {
  assert.equal(quoteSendReason(false, "approved", false), undefined);
  assert.match(quoteSendReason(false, "unsubmitted", false)!, /提交审核/);
  assert.match(quoteSendReason(false, "pending", false)!, /第二人审核/);
  assert.match(quoteSendReason(false, "rejected", false)!, /修改并保存新版本/);
  assert.match(quoteSendReason(false, "unsubmitted", true)!, /重新提交审核/);
});
