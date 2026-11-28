import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { transferPreview } from "../helpers/crm-view-fixtures";
import { newTransferDraft, toggleTransferInquiry } from "../../src/lib/crm-transfer-draft";
const { TransferAssignments } = await import("../../src/components/crm/TransferAssignments");
const d = newTransferDraft(transferPreview);
const render = (draft = d, locked = false) =>
  renderToStaticMarkup(
    <TransferAssignments
      draft={draft}
      locked={locked}
      paging={false}
      onChange={() => {}}
      onToggle={() => {}}
      onPage={() => {}}
      onReview={() => {}}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
assert.doesNotMatch(render(), /checked=""/);
assert.match(render(), /尚未选择目标/);
const chosen = {
  ...toggleTransferInquiry(d, 5),
  recipientID: "3",
  reason: "Reviewed fictional transfer",
  review: true,
};
assert.match(render(chosen), /Fictional inquiry/);
assert.match(render(chosen), /Fictional case/);
assert.match(render(chosen), /未选择的咨询不会自动转交/);
assert.match(render(chosen), /旧客户对外授权保持不变/);
assert.match(render(chosen), /确认提交转交/);
assert.match(render(chosen, true), /disabled=""/);
const offPage = { ...chosen, current: { ...chosen.current, inquiries: [], page: 2 } };
assert.match(render(offPage), /原负责人：Old employee/);
console.log(
  "PASS CRM transfer render: explicit selection, derived-case unit, immutable preview and shared disabled state",
);
