import test from "node:test";
import assert from "node:assert/strict";
import { randomClientID } from "../src/lib/client-id.ts";
test("private HTTP contexts can create cryptographic UUID request keys without randomUUID", () => {
  const crypto = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const a = randomClientID(crypto),
    b = randomClientID(crypto);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});
test("secure contexts retain the native UUID implementation", () => {
  const uuid = "00000000-0000-4000-8000-000000000001" as const;
  assert.equal(
    randomClientID({
      randomUUID: () => uuid,
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    }),
    uuid,
  );
});
