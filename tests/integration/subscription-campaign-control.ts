import {
  up as upCancel,
  down as downCancel,
} from "../../src/migrations/20261121_190000_subscription_campaign_cancel";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import type { Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import {
  readCampaignPause,
  setCampaignPause,
} from "../../src/server/subscription-campaign-control";
import {
  claimMockCampaignTask,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import { up, down } from "../../src/migrations/20261121_150000_subscription_campaign_control";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignControl(p: Payload, url: URL) {
  const env = { ...process.env };
  const key = randomUUID();
  const people: number[] = [];
  let child: ChildProcess | undefined;
  const db = new pg.Client({ connectionString: url.toString() });
  const observer = new pg.Client({ connectionString: url.toString() });
  const adapter = { db: { execute: (text: string) => db.query(text) } };
  const collection = "subscription-campaign-controls";
  await db.connect();
  await observer.connect();
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
      const user = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构暂停测试",
          email: `${people.length}-${key}@example.invalid`,
          role,
          active: true,
          password: key,
        },
      });
      people.push(user.id);
      return user;
    };
    const admin = await person("admin"),
      manager = await person("manager"),
      other = await person("manager");
    const operations = await person("operations"),
      editor = await person("editor"),
      reviewer = await person("reviewer");
    for (const staff of [manager, other])
      await setCampaignGrant(p, admin, {
        staffId: staff.id,
        topic: "policy-updates",
        enabled: true,
      });
    const workspace = await readCampaignWorkspace(p, manager);
    const policies = [
      workspace.choices.find((row) => row.policies.zh && row.policies.en)!.policies,
    ];
    const draft = await saveCampaignDraft(p, manager, { policies });
    let input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const prepare = async () => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    const set = (paused: boolean, reason = "虚构手动控制") =>
      setCampaignPause(p, manager, { ...input, paused, reason });
    const state = () => readCampaignPause(p, manager, input);
    const auditCount = async () =>
      (await p.count({ collection: "audit-events", where: { entity: { equals: collection } } }))
        .totalDocs;
    const mailBefore = (await databaseFingerprints(db)).find(
      (r) => r.table === "subscription_mail_jobs",
    );
    assert.equal((await state()).paused, false);
    assert.equal((await p.count({ collection })).totalDocs, 0);
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await downCancel(adapter as unknown as MigrateDownArgs);
      await down(adapter as unknown as MigrateDownArgs);
      await up(adapter as unknown as MigrateUpArgs);
      await upCancel(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const user of [
      undefined,
      admin,
      operations,
      editor,
      reviewer,
      { ...operations, role: "manager" },
    ]) {
      await assert.rejects(readCampaignPause(p, user, input), { status: 403 });
      await assert.rejects(setCampaignPause(p, user, { ...input, paused: true, reason: "虚构" }), {
        status: 403,
      });
    }
    await assert.rejects(readCampaignPause(p, other, input), { status: 404 });
    await assert.rejects(setCampaignPause(p, other, { ...input, paused: true, reason: "虚构" }), {
      status: 404,
    });
    for (const data of [
      { ...input, paused: "true", reason: "x" },
      { ...input, paused: true, reason: " " },
      { ...input, paused: true, reason: "x", token: randomUUID() },
    ])
      await assert.rejects(setCampaignPause(p, manager, data), { status: 400 });
    await assert.rejects(readCampaignPause(p, manager, { ...input, owner: other.id }), {
      status: 400,
    });
    const paused = await set(true, "虚构首次暂停");
    assert.equal(paused.paused, true, "stopping must work before any valid mock confirmation");
    assert.equal(paused.invalidatedLeases, 0);
    const beforeRepeat = await auditCount();
    assert.equal((await set(true, "重复点击不改原原因")).changedAt, paused.changedAt);
    assert.equal((await state()).reason, "虚构首次暂停");
    assert.equal(await auditCount(), beforeRepeat);
    for (const user of [undefined, admin, manager, other, operations, editor, reviewer]) {
      const row = (await p.find({ collection, depth: 0, limit: 1 })).docs[0];
      const scope = { collection, id: row.id, user, overrideAccess: false } as const;
      await assert.rejects(p.find({ collection, user, overrideAccess: false }), { status: 403 });
      await assert.rejects(
        p.create({ collection, user, overrideAccess: false, data: {} as never }),
        { status: 403 },
      );
      await assert.rejects(p.findByID(scope), { status: 403 });
      await assert.rejects(p.update({ ...scope, data: {} }), { status: 403 });
      await assert.rejects(p.delete(scope), { status: 403 });
    }
    await assert.rejects(set(false), { status: 409 });
    await prepare();
    await assert.rejects(freezeCampaignRecipients(p, manager, input), { status: 409 });
    assert.equal((await p.count({ collection: "subscription-campaign-batches" })).totalDocs, 0);
    await set(false);
    for (let i = 0; i < 2; i++)
      await p.create({
        collection: "subscriptions",
        data: {
          email: `${i}-${key}@example.invalid`,
          topic: "policy-updates",
          locale: "en",
          status: "confirmed",
          consentVersion: 1,
          consentedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          privacyVersion: key,
          sourcePath: "/en",
        },
      });
    const frozen = await freezeCampaignRecipients(p, manager, input);
    await setMockCampaignBudget(p, admin, { remaining: 2, reason: "虚构暂停份额" });
    const firstSlot = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
    const secondSlot = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
    const firstTarget = { ...input, slotId: firstSlot.id! },
      secondTarget = { ...input, slotId: secondSlot.id! };
    const firstLease = await claimMockCampaignTask(p, manager, firstTarget);
    const secondLease = await claimMockCampaignTask(p, manager, secondTarget);
    assert.equal(firstLease.state, "claimed-local");
    assert.equal(secondLease.state, "claimed-local");
    if (firstLease.state !== "claimed-local" || secondLease.state !== "claimed-local")
      throw Error("missing test leases");
    await completeMockCampaignTask(p, manager, { ...firstTarget, token: firstLease.token });
    const completedBefore = await p.findByID({
      collection: "subscription-campaign-mock-leases",
      id: firstLease.id,
      depth: 0,
    });
    const rejectAudit = () =>
      db.query(`CREATE FUNCTION reject_campaign_control_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action IN ('pause-local','resume-local') THEN RAISE EXCEPTION 'reject control audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_campaign_control_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_campaign_control_commit();`);
    const allowAudit = () =>
      db.query(
        "DROP TRIGGER reject_campaign_control_commit ON audit_events; DROP FUNCTION reject_campaign_control_commit()",
      );
    await rejectAudit();
    try {
      await assert.rejects(set(true), { status: 503 });
      assert.equal((await state()).paused, false);
      assert.equal(
        (
          await p.findByID({
            collection: "subscription-campaign-mock-leases",
            id: secondLease.id,
            depth: 0,
          })
        ).expiresAt,
        secondLease.expiresAt,
      );
    } finally {
      await allowAudit();
    }
    const workerName = "pause-worker-" + key;
    child = fork(new URL("../helpers/subscription-mock-worker.ts", import.meta.url), [], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      env: { ...process.env, PGAPPNAME: workerName },
    });
    await once(child, "message", { signal: AbortSignal.timeout(45000) });
    await db.query("BEGIN");
    const lock = await db.query("SELECT pg_advisory_xact_lock(726281),pg_backend_pid() AS pid");
    const stopping = set(true);
    stopping.catch(() => {});
    let committed = false;
    try {
      let blocked = false;
      for (let i = 0; i < 500; i++) {
        blocked = (
          await db.query(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))) AS blocked",
            [lock.rows[0].pid],
          )
        ).rows[0].blocked;
        if (blocked) break;
        await delay(10);
      }
      assert.ok(blocked, "pause must hold the shared content lock before worker completion");
      const finished = once(child, "message", { signal: AbortSignal.timeout(45000) });
      child.send({
        actorId: manager.id,
        action: "complete",
        delayStart: true,
        input: { ...secondTarget, token: secondLease.token },
      });
      let contended = false;
      for (let i = 0; i < 500; i++) {
        const contention = await observer.query(
          `SELECT EXISTS(SELECT 1 FROM pg_stat_activity w
        JOIN pg_stat_activity pause ON pause.pid=ANY(pg_blocking_pids(w.pid))
        WHERE w.datname=current_database() AND w.application_name=$1
          AND $2=ANY(pg_blocking_pids(pause.pid))) AS contended`,
          [workerName, lock.rows[0].pid],
        );
        contended = contention.rows[0].contended;
        if (contended) break;
        await delay(10);
      }
      assert.ok(contended, "worker must contend before pause is released");
      await db.query("COMMIT");
      committed = true;
      assert.equal((await stopping).invalidatedLeases, 1);
      const [result] = await finished;
      assert.notEqual(result.pid, process.pid);
      assert.equal(result.error, 409, "worker cannot complete after pause commits first");
    } finally {
      if (!committed) await db.query("ROLLBACK");
      await stopping;
    }
    assert.deepEqual(
      await p.findByID({
        collection: "subscription-campaign-mock-leases",
        id: firstLease.id,
        depth: 0,
      }),
      completedBefore,
    );
    assert.equal(
      (
        await p.findByID({
          collection: "subscription-campaign-mock-leases",
          id: secondLease.id,
          depth: 0,
        })
      ).completedAt,
      null,
    );
    for (const work of [
      () => freezeCampaignRecipients(p, manager, input),
      () => reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() }),
      () => claimMockCampaignTask(p, manager, secondTarget),
      () => completeMockCampaignTask(p, manager, { ...secondTarget, token: secondLease.token }),
    ])
      await assert.rejects(work(), { status: 409 });
    await rejectAudit();
    try {
      await assert.rejects(set(false), { status: 503 });
      assert.equal((await state()).paused, true);
    } finally {
      await allowAudit();
    }
    await set(false);
    await assert.rejects(
      completeMockCampaignTask(p, manager, { ...secondTarget, token: secondLease.token }),
      { status: 409 },
    );
    const recovered = await claimMockCampaignTask(p, manager, secondTarget);
    assert.equal(recovered.state, "claimed-local");
    if (recovered.state !== "claimed-local") throw Error("missing recovered lease");
    assert.notEqual(recovered.token, secondLease.token);
    await completeMockCampaignTask(p, manager, { ...secondTarget, token: recovered.token });
    await set(true);
    const next = await saveCampaignDraft(p, manager, { ...input, policies });
    const oldInput = input;
    input = { campaignKey: next.campaignKey, revision: next.revision };
    assert.equal(
      (await state()).paused,
      true,
      "new draft revisions must retain the same activity pause",
    );
    await assert.rejects(
      setCampaignPause(p, manager, { ...oldInput, paused: false, reason: "旧版" }),
      { status: 409 },
    );
    await assert.rejects(set(false), { status: 409 });
    await prepare();
    await set(false);
    const previousFrom = process.env.WORKFLOW_MAIL_FROM;
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    await set(true, "配置失效时仍可停止");
    await assert.rejects(set(false), { status: 409 });
    if (previousFrom === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = previousFrom;
    await prepare();
    await set(false);
    const activeFacts = await db.query<{ id: number; fact: number }>(
      "SELECT id,active_fact_version_id AS fact FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
    );
    try {
      await db.query("UPDATE policy_groups SET active_fact_version_id=NULL");
      assert.equal((await set(true, "来源下架时仍能停止")).paused, true);
      await assert.rejects(set(false), { status: 409 });
      assert.equal((await state()).paused, true);
    } finally {
      for (const row of activeFacts.rows)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          row.fact,
          row.id,
        ]);
    }
    await prepare();
    await set(false);
    assert.deepEqual(
      (await p.findByID({ collection: "subscription-campaign-batches", id: frozen.id, depth: 0 }))
        .counts,
      frozen.counts,
    );
    assert.equal((await p.count({ collection: "subscription-campaign-mock-slots" })).totalDocs, 2);
    assert.deepEqual(
      (await databaseFingerprints(db)).find((r) => r.table === "subscription_mail_jobs"),
      mailBefore,
    );
    const controls = await p.find({ collection, depth: 0, pagination: false });
    assert.equal(controls.totalDocs, 1);
    const audits = await p.find({
      collection: "audit-events",
      depth: 0,
      pagination: false,
      where: { entity: { equals: collection } },
    });
    const auditText = JSON.stringify(audits.docs);
    for (const token of [firstLease.token, secondLease.token, recovered.token])
      assert.ok(!auditText.includes(token));
    assert.ok(audits.docs.every((row) => row.actor === manager.id));
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down(adapter as unknown as MigrateDownArgs),
        /Preserve campaign controls/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    process.env.APP_ENV = "trial";
    await assert.rejects(state(), { status: 403 });
    await assert.rejects(set(true), { status: 403 });
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(state(), { status: 403 });
    await assert.rejects(set(true), { status: 403 });
    console.log(
      "PASS 本地活动暂停恢复、跨进程完成竞争、旧租约失效、版本与确认门禁、权限及审计回滚",
    );
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    for (const collection of [
      "subscription-campaign-controls",
      "subscription-campaign-mock-leases",
      "subscription-campaign-mock-slots",
      "subscription-campaign-mock-budgets",
      "subscription-campaign-jobs",
      "subscription-campaign-batches",
    ] as const)
      await p.delete({ collection, where: {} });
    await p.delete({
      collection: "subscription-campaign-checks",
      where: { kind: { equals: "mock-confirm" } },
    });
    await p.delete({ collection: "subscription-campaign-checks", where: {} });
    await p.delete({
      collection: "subscription-campaign-drafts",
      where: { owner: { in: people } },
    });
    await p.delete({
      collection: "subscription-campaign-grants",
      where: { staff: { in: people } },
    });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await db.query("DELETE FROM subscriptions WHERE privacy_version=$1", [key]);
    await db.end();
    await observer.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
