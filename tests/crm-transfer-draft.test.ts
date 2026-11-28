import assert from "node:assert/strict";
import test from "node:test";
import type { TransferPreview } from "../src/lib/crm-assignments.ts";
const preview: TransferPreview = {
  clientID: 1,
  expectedClientRevision: 7,
  clientOwner: { id: 2, name: "Old", state: "valid" },
  receivers: [{ id: 3, name: "Next" }],
  inquiries: [
    {
      inquiryID: 5,
      expectedUpdatedAt: "2026-11-28T00:00:00.000Z",
      expectedOwnerID: 2,
      expectedCaseRevision: 4,
      reference: "Q-5",
      name: "Fictional",
      ownerDisplay: { id: 2, name: "Old", state: "valid" },
      serviceCase: { id: 8, title: "Case", stage: "discovery" },
    },
  ],
  total: 21,
  page: 1,
  limit: 20,
};
test("CRM transfer draft captures original versions across pages and starts with zero selection", async () => {
  const { newTransferDraft, toggleTransferInquiry, mergeTransferPage, captureTransferDraft } =
    await import("../src/lib/crm-transfer-draft.ts");
  let d = newTransferDraft(preview);
  assert.equal(d.selected.length, 0);
  assert.equal(d.transferClient, false);
  d = toggleTransferInquiry(d, 5);
  assert.equal(d.selected[0].expectedCaseRevision, 4);
  const changed = structuredClone(preview);
  changed.page = 2;
  changed.inquiries[0].expectedCaseRevision = 9;
  d = mergeTransferPage(d, changed);
  assert.equal(d.selected[0].expectedCaseRevision, 4);
  const captured = captureTransferDraft(d, 3, "Reviewed fictional transfer");
  assert.equal(captured.expectedClientRevision, 7);
  assert.equal(captured.inquiries[0].expectedCaseRevision, 4);
  assert.equal("operationKey" in captured, false);
  changed.expectedClientRevision = 8;
  assert.throws(() => mergeTransferPage(d, changed), /版本/);
  const many = {
    ...preview,
    inquiries: Array.from({ length: 21 }, (_, i) => ({
      ...preview.inquiries[0],
      inquiryID: i + 1,
    })),
  };
  let full = newTransferDraft(many);
  for (let i = 1; i <= 20; i++) full = toggleTransferInquiry(full, i);
  assert.throws(() => toggleTransferInquiry(full, 21), /20/);
});
test("CRM receipt confirmation counts actual changes, rejects malformed or unrelated acknowledgements", async () => {
  const {
    newTransferDraft,
    toggleTransferInquiry,
    captureTransferDraft,
    confirmedTransfer,
    transferResultLabel,
  } = await import("../src/lib/crm-transfer-draft.ts");
  const d = { ...toggleTransferInquiry(newTransferDraft(preview), 5), transferClient: true };
  const input = captureTransferDraft(d, 3, "Reviewed fictional transfer");
  const receipt = {
    clientID: 1,
    revision: 8,
    transferID: 12,
    transferredClient: false,
    inquiryIDs: [5],
  };
  assert.ok(confirmedTransfer(receipt, input));
  assert.match(transferResultLabel(receipt), /客户主负责人 0 项.*咨询 1 项/);
  for (const bad of [
    { ...receipt, clientID: 2 },
    { ...receipt, transferID: 0 },
    { ...receipt, inquiryIDs: [6] },
    { ...receipt, inquiryIDs: [5, 5] },
    { ...receipt, inquiryIDs: [] },
    { ...receipt, transferredClient: "true" },
  ])
    assert.equal(confirmedTransfer(bad, input), false);
  assert.equal(
    confirmedTransfer({ ...receipt, transferredClient: true }, { ...input, transferClient: false }),
    false,
  );
});
