import assert from "node:assert/strict";
import test from "node:test";
import { crmQuery } from "../src/lib/crm-http-query.ts";
test("CRM HTTP query normalizes only canonical IDs and rejects duplicates/extra capabilities", () => {
  assert.deepEqual(crmQuery("http://example.invalid/api/crm?action=get&clientID=7"), {
    action: "get",
    clientID: 7,
  });
  for (const query of [
    "action=get&clientID=01",
    "action=get&clientID=-1",
    "action=get&clientID=1.1",
    "action=get&clientID=9007199254740992",
    "action=get&clientID=1&clientID=2",
    "action=list&actor=1",
    "action=list&depth=2",
  ])
    assert.throws(() => crmQuery("http://example.invalid/api/crm?" + query));
});
