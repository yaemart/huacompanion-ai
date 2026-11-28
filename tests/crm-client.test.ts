import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
test("CRM missing owner names never attribute another employee's customer to the viewer", async () => {
  const { crmOwnerLabel } = await import("../src/lib/crm-client.ts");
  assert.equal(crmOwnerLabel("admin", 7), "负责人当前不可用");
  assert.equal(crmOwnerLabel("manager", 7), "负责人当前不可用");
  assert.equal(crmOwnerLabel("operations", 7), "本人负责");
  assert.equal(crmOwnerLabel("admin", null), "待分派");
  assert.equal(crmOwnerLabel("manager", 7, "虚构负责人"), "虚构负责人");
});
test("CRM unknown results freeze original payload and key until a valid receipt", async () => {
  assert.ok(existsSync("src/lib/crm-client.ts"));
  const { beginCrmWrite, settleCrmWrite } = await import("../src/lib/crm-client.ts");
  const input = { action: "createClient", displayName: "Original" };
  const started = beginCrmWrite(input, "fixed-key");
  input.displayName = "Changed";
  const unknown = settleCrmWrite(started, undefined, false)!;
  assert.equal(JSON.parse(unknown.payload).displayName, "Original");
  assert.equal(JSON.parse(unknown.payload).operationKey, "fixed-key");
  assert.equal(settleCrmWrite(unknown, 409, false)?.payload, unknown.payload);
  assert.equal(settleCrmWrite(unknown, 200, false)?.unknown, true);
  assert.equal(settleCrmWrite(unknown, 200, true), undefined);
  assert.equal(settleCrmWrite(started, 400, false), undefined);
});
