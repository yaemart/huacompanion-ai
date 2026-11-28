import assert from "node:assert/strict";
import test from "node:test";
test("CRM overview displays explicit unassigned/invalid owners and Beijing dates safely", async () => {
  const { ownerLabel, followUpLabel } = await import("../src/lib/crm-overview-view.ts");
  assert.match(
    ownerLabel({ id: 7, name: "Fictional employee", state: "inactive" }),
    /待分派.*已停用/,
  );
  assert.match(ownerLabel({ id: 7, name: null, state: "ineligible" }), /待分派/);
  assert.equal(ownerLabel({ id: null, name: null, state: "unassigned" }), "待分派");
  assert.equal(
    ownerLabel({ id: 7, name: "Fictional employee", state: "valid" }),
    "Fictional employee",
  );
  assert.match(followUpLabel(null), /未填写/);
  assert.equal(followUpLabel("2026-11-28T00:00:00.000Z"), "2026-11-28 08:00（北京时间）");
  assert.match(followUpLabel("invalid"), /异常/);
});
