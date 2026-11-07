import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapInput } from "../scripts/lib/bootstrap-input.ts";

const valid = {
  APP_ENV: "trial",
  DATABASE_URL: "postgresql://local:local@db:5432/hua_companion",
  BOOTSTRAP_ADMIN_EMAIL: "owner@example.invalid",
  BOOTSTRAP_ADMIN_PASSWORD: "a-long-generated-secret-for-bootstrap",
};
test("first admin bootstrap refuses production, missing database and weak or invalid credentials", () => {
  assert.throws(() => bootstrapInput({ ...valid, APP_ENV: "production" }));
  assert.throws(() => bootstrapInput({ ...valid, DATABASE_URL: "" }));
  assert.throws(() => bootstrapInput({ ...valid, DATABASE_URL: "https://example.invalid" }));
  assert.throws(() => bootstrapInput({ ...valid, BOOTSTRAP_ADMIN_EMAIL: "bad" }));
  assert.throws(() => bootstrapInput({ ...valid, BOOTSTRAP_ADMIN_PASSWORD: "short" }));
  assert.throws(() => bootstrapInput({ ...valid, BOOTSTRAP_ADMIN_NAME: "x".repeat(101) }));
});
test("first admin bootstrap accepts explicit trial credentials without modifying them", () => {
  const result = bootstrapInput(valid);
  assert.equal(result.email, valid.BOOTSTRAP_ADMIN_EMAIL);
  assert.equal(result.password, valid.BOOTSTRAP_ADMIN_PASSWORD);
  assert.equal(result.name, "华伴试运行管理员");
});
