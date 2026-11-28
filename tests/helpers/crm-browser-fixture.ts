import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import type { Payload } from "payload";
import type { Staff } from "../../payload-types";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { crmAction } from "../../src/server/crm/service";
import { crmRead } from "../../src/server/crm/read";
import { transactionSession } from "../../src/server/db-types";
import { databaseFingerprints } from "./database-fingerprints";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { randomUUID } from "node:crypto";
export async function seedCrmBrowser(
  p: Payload,
  admin: Staff,
  teamID: number,
  operator: Staff,
  manager: Staff,
  clientID: number,
) {
  assertCrmTarget(process.env.DATABASE_URL ?? "");
  if (!process.argv.includes("--preview") || process.env.HUA_CRM_ISOLATED !== "true")
    throw Error("CRM virtual preview only");
  mkdirSync(".local/crm-b3", { recursive: true });
  for (const file of ["control.json", "control-result.json"])
    if (existsSync(".local/crm-b3/" + file)) unlinkSync(".local/crm-b3/" + file);
  const user = { ...admin, collection: "staff" as const },
    req = { user },
    key = () => randomUUID();
  const password = "Fictional-preview-only!2026";
  const recipient = await p.create({
    collection: "staff",
    req,
    data: {
      name: "虚构接收人",
      email: "crm-recipient-preview@example.invalid",
      password,
      role: "operations",
      team: teamID,
      active: true,
    },
  });
  const current = async (id: number) => {
    const c = await crmRead(p, user, { action: "get", clientID: id });
    if (!("revision" in c)) throw Error("Wrong fixture client");
    return c;
  };
  const createClient = async (
    name: string,
    ownerID: number | null,
    kind: "company" | "individual",
  ) =>
    (
      await crmAction(p, user, {
        action: "createClient",
        operationKey: key(),
        kind,
        displayName: name,
        language: "zh",
        teamID,
        ownerID,
      })
    ).clientID;
  const personalClientID = await createClient("虚构个人客户 · 日常咨询", operator.id, "individual");
  const unassignedClientID = await createClient("虚构待分派企业", null, "company");
  for (let n = 0; n < 23; n++) {
    const q = await p.create({
      collection: "inquiries",
      req,
      data: {
        reference: `B3-FICTION-${String(n + 1).padStart(2, "0")}`,
        requestKey: key(),
        contentHash: key(),
        name: n === 0 ? "虚构长名称企业客户业务 · 会议与展会协调核对" : "虚构业务 " + (n + 1),
        email: "b3-fictional@example.invalid",
        categories: ["business"],
        city: "Shanghai",
        status: "new",
        team: teamID,
        owner: n === 22 ? null : operator.id,
        nextFollowUp: n === 0 ? new Date(Date.now() - 3600000).toISOString() : null,
      },
    });
    const cid = n === 22 ? unassignedClientID : clientID;
    await crmAction(p, user, {
      action: "linkInquiry",
      clientID: cid,
      inquiryID: q.id,
      expectedClientRevision: (await current(cid)).revision,
      expectedLinkRevision: 0,
      reason: "Fictional reviewed B3 browser fixture",
      operationKey: key(),
    });
    if (n === 0)
      await p.create({
        collection: "service-cases",
        data: { inquiry: q.id, title: "虚构展会接待协调服务单", stage: "discovery", revision: 1 },
      });
  }
  const c = await crmAction(p, user, {
    action: "saveContact",
    clientID,
    expectedClientRevision: (await current(clientID)).revision,
    name: "虚构企业联系人",
    email: "b3-contact@example.invalid",
    operationKey: key(),
  });
  await crmAction(p, user, {
    action: "setPrimaryContact",
    clientID,
    expectedClientRevision: c.clientRevision,
    contactID: c.contactID,
    operationKey: key(),
  });
  const metadata = {
    base: "http://127.0.0.1:3201",
    pid: process.pid,
    clientID,
    personalClientID,
    unassignedClientID,
    recipientID: recipient.id,
    operatorID: operator.id,
    operatorEmail: operator.email,
    managerEmail: manager.email,
  };
  writeFileSync(".local/crm-b3/preview.json", JSON.stringify(metadata), { mode: 0o600 });
  const owned = [clientID, personalClientID, unassignedClientID],
    pool = (p.db as unknown as PostgresAdapter).pool;
  const fingerprint = async () =>
    (await databaseFingerprints(pool)).filter((t) =>
      ["crm_clients", "inquiries", "crm_operations", "customer_inquiry_links"].includes(t.table),
    );
  let barrier: number | string | null = null,
    baseline: Awaited<ReturnType<typeof fingerprint>> | undefined;
  let running: Promise<void> | undefined;
  const control = async () => {
    const command = JSON.parse(readFileSync(".local/crm-b3/control.json", "utf8")) as {
      action: string;
      clientID?: number;
      to?: string;
    };
    unlinkSync(".local/crm-b3/control.json");
    if (Object.keys(command).some((k) => !["action", "clientID", "to"].includes(k)))
      throw Error("Bad fixture command");
    const id = command.clientID ?? clientID;
    if (!owned.includes(id)) throw Error("Only run-owned clients");
    let unchanged: boolean | undefined;
    if (command.action === "bumpClient")
      await crmAction(p, user, {
        action: "updateClient",
        clientID: id,
        expectedRevision: (await current(id)).revision,
        displayName: (await current(id)).displayName,
        operationKey: key(),
      });
    else if (command.action === "reassignClient")
      await crmAction(p, user, {
        action: "transferAssignments",
        clientID: id,
        expectedClientRevision: (await current(id)).revision,
        recipientID: command.to === "operator" ? operator.id : recipient.id,
        transferClient: true,
        inquiries: [],
        reason: "Fictional browser visibility control",
        operationKey: key(),
      });
    else if (command.action === "hold") {
      if (barrier) throw Error("Fixture barrier already held");
      baseline = await fingerprint();
      barrier = await p.db.beginTransaction();
      if (!barrier) throw Error("Fixture transaction required");
      await transactionSession(p, barrier).db.execute("SELECT pg_advisory_xact_lock(726281)");
    } else if (command.action === "revokeAndRelease") {
      if (!barrier) throw Error("Fixture barrier missing");
      await p.update({
        collection: "staff",
        id: admin.id,
        data: { sessions: [] },
        req: { user, transactionID: barrier },
      });
      await p.db.commitTransaction(barrier);
      barrier = null;
    } else if (command.action === "verifyUnchanged") {
      if (!baseline) throw Error("Fixture baseline missing");
      unchanged = JSON.stringify(await fingerprint()) === JSON.stringify(baseline);
    } else throw Error("Unsupported fixture command");
    writeFileSync(
      ".local/crm-b3/control-result.json",
      JSON.stringify({ ok: true, action: command.action, unchanged }),
      { mode: 0o600 },
    );
  };
  const timer = setInterval(() => {
    if (running || !existsSync(".local/crm-b3/control.json")) return;
    running = control()
      .catch(() => {
        writeFileSync(".local/crm-b3/control-result.json", JSON.stringify({ ok: false }), {
          mode: 0o600,
        });
      })
      .finally(() => {
        running = undefined;
      });
  }, 100);
  return async () => {
    clearInterval(timer);
    await running;
    if (barrier) await p.db.rollbackTransaction(barrier);
  };
}
