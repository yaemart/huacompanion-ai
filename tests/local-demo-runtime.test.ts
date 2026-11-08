import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertDemoInvocation,
  resolvePostgres,
  demoWeb,
  webAddress,
} from "../scripts/lib/demo-runtime.mjs";

test("local invocation refuses external environments and conflicting database URLs", () => {
  const state = { databaseURL: "postgresql://local-demo" };
  assert.doesNotThrow(() => assertDemoInvocation(state, {}));
  assert.throws(() => assertDemoInvocation(state, { APP_ENV: "production" }), /本地/);
  assert.throws(
    () => assertDemoInvocation(state, { DATABASE_URL: "postgresql://remote" }),
    /DATABASE_URL/,
  );
  assert.throws(
    () => assertDemoInvocation(null, { DATABASE_URL: "postgresql://remote" }),
    /DATABASE_URL/,
  );
});
test("PG selection supports 16 and refuses mismatched initialized clusters", () => {
  const root = mkdtempSync(join(tmpdir(), "hua-pg-choice-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "postgres"), '#!/bin/sh\necho "postgres (PostgreSQL) 16.6"\n', {
      mode: 0o700,
    });
    assert.equal(resolvePostgres(root, { PG_BIN: bin }), bin);
    writeFileSync(join(root, "PG_VERSION"), "15\n");
    assert.throws(() => resolvePostgres(root, { PG_BIN: bin }), /15.*16|16.*15/);
    writeFileSync(join(root, "PG_VERSION"), "16\n");
    assert.equal(resolvePostgres(root, { PG_BIN: bin }), bin);
    writeFileSync(join(root, "PG_VERSION"), "17\n");
    assert.throws(() => resolvePostgres(root, { PG_BIN: bin }), /15.*16/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("LAN is explicit and never binds a public address or wildcard", () => {
  assert.equal(demoWeb(false, {}).host, "127.0.0.1");
  assert.throws(
    () =>
      demoWeb(true, {
        x: [
          {
            address: "8.8.8.8",
            family: "IPv4",
            internal: false,
            netmask: "255.255.255.0",
            mac: "00:00:00:00:00:00",
            cidr: null,
          },
        ],
      }),
    /Wi-Fi|私网/,
  );
  const lan = demoWeb(true, {
    en0: [
      {
        address: "192.168.1.20",
        family: "IPv4",
        internal: false,
        netmask: "255.255.255.0",
        mac: "00:00:00:00:00:00",
        cidr: null,
      },
    ],
  });
  assert.equal(lan.host, "192.168.1.20");
  assert.equal(lan.url, "http://192.168.1.20:3100");
});

test("web addresses reject noncanonical or wildcard inputs", () => {
  for (const host of ["0.0.0.0", "192.168.1.", "192.168.1.20/path", "8.8.8.8"])
    assert.throws(() => webAddress(host), /只允许/);
});
