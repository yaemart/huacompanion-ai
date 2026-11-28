import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { overview } from "../helpers/crm-view-fixtures";
const { CustomerOverview } = await import("../../src/components/crm/CustomerOverview");
const { AssignmentQueue } = await import("../../src/components/crm/AssignmentQueue");
const html = renderToStaticMarkup(
  <CustomerOverview
    data={overview}
    disabled={false}
    onPage={() => {}}
    history={{
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      asOf: "2026-11-28",
      timeZone: "Asia/Shanghai",
    }}
    onHistoryPage={() => {}}
  />,
);
assert.match(html, /待分派/);
assert.match(html, /当前权限范围内暂无业务/);
assert.match(html, /当前权限范围内暂无可见转交记录/);
assert.match(html, /&lt;script&gt;/);
assert.doesNotMatch(html, /<script>/);
const op = renderToStaticMarkup(
  <CustomerOverview data={overview} disabled={false} onPage={() => {}} />,
);
assert.doesNotMatch(op, /转交记录/);
const queue = renderToStaticMarkup(
  <AssignmentQueue
    target="client"
    disabled={false}
    onTarget={() => {}}
    onPage={() => {}}
    onOpenClient={() => {}}
    data={{
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      asOf: "2026-11-28",
      timeZone: "Asia/Shanghai",
    }}
  />,
);
assert.match(queue, /当前权限范围内暂无待分派/);
const failed = renderToStaticMarkup(
  <AssignmentQueue
    target="inquiry"
    disabled={false}
    onTarget={() => {}}
    onPage={() => {}}
    onOpenClient={() => {}}
  />,
);
assert.match(failed, /尚未读取/);
assert.doesNotMatch(failed, /暂无待分派/);
const withCase = structuredClone(overview);
withCase.inquiries.items = [
  {
    id: 5,
    reference: "Q-5",
    name: "Fictional",
    status: "new",
    ownerDisplay: { id: 2, name: "Owner", state: "valid" },
    nextFollowUp: null,
    updatedAt: "2026-11-28T00:00:00.000Z",
    needsReview: false,
    serviceCase: { id: 8, title: "Case", stage: "discovery", revision: 1, latestQuote: null },
  },
];
const linked = renderToStaticMarkup(
  <CustomerOverview data={withCase} disabled={false} onPage={() => {}} />,
);
assert.match(linked, /href="\/business-center\?id=8"/);
assert.doesNotMatch(linked, /href="\/business-center\?id=5"/);
console.log(
  "PASS CRM overview render: scoped empty/error states, invalid owner, escaped names and management-only history",
);
