import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

test("CRM strict validator is available before any service access", async () => {
  assert.ok(existsSync("src/lib/crm.ts"), "CRM validator must exist");
  const { parseCrmAction } = await import("../src/lib/crm.ts");
  const key = "11b31e1a-a145-4dd9-a48f-05946a18ff98";
  assert.deepEqual(
    parseCrmAction({
      action: "createClient",
      operationKey: key,
      kind: "company",
      displayName: "  Example  ",
      language: "en",
    }).displayName,
    "Example",
  );
  for (const extra of [{ owner: 2 }, { role: "admin" }, { kind: "invalid" }]) {
    assert.throws(() =>
      parseCrmAction({
        action: "createClient",
        operationKey: key,
        kind: "company",
        displayName: "Example",
        language: "en",
        ...extra,
      }),
    );
  }
  for (const clientID of [0, -1, 1.2, "1", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() =>
      parseCrmAction({
        action: "archiveClient",
        operationKey: key,
        clientID,
        expectedRevision: 1,
        reason: "A sufficiently long reason",
      }),
    );
  }
  assert.throws(() =>
    parseCrmAction({
      action: "saveContact",
      operationKey: key,
      clientID: 1,
      expectedClientRevision: 1,
      name: "Contact",
    }),
  );
});

test("CRM mutation whitelist and nullable contact rules", async () => {
  const { parseCrmAction } = await import("../src/lib/crm.ts");
  const operationKey = "11b31e1a-a145-4dd9-a48f-05946a18ff98";
  const update = { action: "updateClient", operationKey, clientID: 1, expectedRevision: 1 };
  for (const data of [
    {},
    { kind: "company" },
    { ownerID: 2 },
    { revision: 9 },
    { displayName: " " },
    { language: "fr" },
    { countryCode: "USA" },
    { displayName: { nested: true } },
  ])
    assert.throws(() => parseCrmAction({ ...update, ...data }));
  assert.equal(parseCrmAction({ ...update, countryCode: null }).countryCode, null);
  assert.equal(parseCrmAction({ ...update, countryCode: "JP" }).countryCode, "JP");
  const contact = {
    action: "saveContact",
    operationKey,
    clientID: 1,
    expectedClientRevision: 1,
    name: "Person",
  };
  assert.equal(
    parseCrmAction({ ...contact, email: " HELLO@EXAMPLE.INVALID " }).email,
    "hello@example.invalid",
  );
  for (const data of [
    { email: "invalid" },
    { phone: "" },
    { email: null },
    { phone: "x", isPrimary: true },
    { phone: "x", status: "active" },
    { phone: "x", expectedRevision: 1 },
  ])
    assert.throws(() => parseCrmAction({ ...contact, ...data }));
  for (const action of ["archiveContact", "archiveClient", "setPrimaryContact"])
    assert.throws(() => parseCrmAction({ action, operationKey }));
});
