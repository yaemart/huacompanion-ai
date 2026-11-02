import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { runPolicyReminders } from "../../src/server/immigration/reminders";
import { mutateContent } from "../../src/server/content/service";
import { workflowRead, runWorkflowJobs } from "../../src/server/workflow/service";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";
if (process.env.APP_ENV !== "local") throw Error("Local fixtures only");
const p = await getPayload({ config });
const flag = process.env.VISA_CHECKER_ENABLED;
const settings = await p.findGlobal({ slug: "workflow-settings" });
try {
  process.env.VISA_CHECKER_ENABLED = "false";
  assert.deepEqual(await runPolicyReminders({} as never), { queued: 0 });
  process.env.VISA_CHECKER_ENABLED = "true";
  await p.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
  await policyFixture(p, async ({ body, editor, reviewer, outsider, admin }) => {
    let draft = await mutateContent(p, editor, {
      action: "save",
      body,
      policy: { ...policyFacts(editor.id), validUntil: "2026-12-01" },
    });
    const tasks = async () =>
      (
        await p.find({
          collection: "workflow-tasks",
          where: { contentDraft: { equals: draft.id } },
          pagination: false,
          depth: 0,
        })
      ).docs;
    const notifications = async () =>
      (
        await p.find({
          collection: "workflow-notifications",
          where: { contentDraft: { equals: draft.id } },
          pagination: false,
          depth: 0,
        })
      ).docs;
    const mailBefore = (await p.count({ collection: "workflow-mail-jobs" })).totalDocs;
    try {
      await runPolicyReminders(p, "2026-11-01");
      assert.equal((await tasks()).length, 0);
      draft = await mutateContent(p, editor, {
        action: "submit",
        id: draft.id,
        revision: draft.revision,
      });
      draft = await mutateContent(p, reviewer, {
        action: "publish",
        id: draft.id,
        revision: draft.revision,
        policyReviewed: true,
      });
      await runPolicyReminders(p, "2026-10-31");
      assert.equal((await tasks()).length, 0);
      await Promise.all([runPolicyReminders(p, "2026-11-01"), runPolicyReminders(p, "2026-11-01")]);
      assert.equal((await tasks()).length, 1);
      assert.equal((await tasks())[0].assignee, null);
      assert.equal(
        (await workflowRead(p, outsider)).tasks.some((t) => t.contentDraft === draft.id),
        false,
      );
      assert.equal(
        (await workflowRead(p, admin)).tasks.some((t) => t.contentDraft === draft.id),
        true,
      );
      assert.equal((await notifications()).length, 0);
      // Manual valid assignment survives repeated scans, then loss of board scope clears it.
      await p.update({
        collection: "workflow-tasks",
        id: (await tasks())[0].id,
        data: { assignee: editor.id },
      });
      await runPolicyReminders(p, "2026-11-02");
      assert.equal((await tasks())[0].assignee, editor.id);
      await p.update({
        collection: "staff",
        id: editor.id,
        user: admin,
        data: { contentKinds: ["guide"] },
      });
      await runPolicyReminders(p, "2026-11-03");
      assert.equal((await tasks())[0].assignee, null);
      await p.update({
        collection: "staff",
        id: editor.id,
        user: admin,
        data: { contentKinds: ["immigration-policy"] },
      });
      // A quality owner supplies a fresh, scoped recipient for the 7-day reminder.
      const quality = (
        await p.find({
          collection: "content-quality",
          where: { draftId: { equals: draft.id } },
          limit: 1,
        })
      ).docs[0];
      await p.update({
        collection: "content-quality",
        id: quality.id,
        data: {
          draftId: draft.id,
          kind: "immigration-policy",
          contentKey: "test",
          locale: "en",
          title: "Fixture",
          owner: editor.id,
          state: "review-needed",
        },
      });
      await p.update({
        collection: "workflow-tasks",
        id: (await tasks())[0].id,
        data: { assignee: outsider.id, history: [] },
      });
      await runPolicyReminders(p, "2026-11-24");
      const closedHistory = (await tasks()).find((t) => t.status === "done")!.history;
      assert.match(JSON.stringify(closedHistory), /system-unassign/);
      assert.match(JSON.stringify(closedHistory), /system-close/);
      assert.equal((await tasks()).length, 2);
      assert.equal((await tasks()).filter((t) => t.status === "open").length, 1);
      assert.equal((await notifications()).length, 1);
      await runPolicyReminders(p, "2026-12-03");
      assert.equal((await notifications()).length, 1);
      await p.update({
        collection: "workflow-tasks",
        id: (await tasks()).find((t) => t.status === "open")!.id,
        data: { dueAt: "2000-01-01T00:00:00Z" },
      });
      await runWorkflowJobs(p);
      assert.equal((await p.count({ collection: "workflow-mail-jobs" })).totalDocs, mailBefore);
      // A working edit cannot replace formal reminders until it passes review and publication.
      draft = await mutateContent(p, editor, {
        action: "save",
        id: draft.id,
        revision: draft.revision,
        body,
        policy: { ...policyFacts(editor.id), validUntil: "2027-01-01" },
      });
      await runPolicyReminders(p, "2026-12-03");
      assert.equal((await tasks()).length, 2);
      draft = await mutateContent(p, editor, {
        action: "submit",
        id: draft.id,
        revision: draft.revision,
      });
      draft = await mutateContent(p, reviewer, {
        action: "publish",
        id: draft.id,
        revision: draft.revision,
        policyReviewed: true,
      });
      await runPolicyReminders(p, "2026-12-03");
      assert.equal((await tasks()).length, 3);
      assert.equal((await tasks()).filter((t) => t.status === "open").length, 1);
      draft = await mutateContent(p, reviewer, {
        action: "unpublish",
        id: draft.id,
        revision: draft.revision,
      });
      await runPolicyReminders(p, "2026-12-03");
      assert.equal((await tasks()).filter((t) => t.status === "open").length, 0);
      async function republish(until: string | null) {
        draft = await mutateContent(p, editor, {
          action: "save",
          id: draft.id,
          revision: draft.revision,
          body,
          policy: { ...policyFacts(editor.id), validUntil: until },
        });
        draft = await mutateContent(p, editor, {
          action: "submit",
          id: draft.id,
          revision: draft.revision,
        });
        draft = await mutateContent(p, reviewer, {
          action: "publish",
          id: draft.id,
          revision: draft.revision,
          policyReviewed: true,
        });
      }
      await republish(null);
      await runPolicyReminders(p, "2026-12-03");
      assert.equal((await tasks()).length, 3, "no expiry generates no task");
      await republish("2026-12-10");
      await p.updateGlobal({ slug: "workflow-settings", data: { enabledEvents: [] } });
      await runPolicyReminders(p, "2026-12-03");
      assert.equal((await tasks()).length, 3, "event toggle respected");
      await p.updateGlobal({
        slug: "workflow-settings",
        data: { enabledEvents: settings.enabledEvents },
      });
      const notificationsBeforeCatchup = (await notifications()).length;
      const create = p.create.bind(p);
      p.create = ((args: Parameters<typeof p.create>[0]) => {
        if (args.collection === "workflow-notifications") throw Error("fixture interrupted");
        return create(args);
      }) as typeof p.create;
      try {
        await assert.rejects(() => runPolicyReminders(p, "2026-12-03"), /fixture interrupted/);
      } finally {
        p.create = create;
      }
      assert.equal((await tasks()).length, 3, "transaction rollback leaves no partial reminders");
      await runPolicyReminders(p, "2026-12-03");
      assert.equal((await tasks()).length, 5, "catchup preserves both thresholds");
      assert.equal((await tasks()).filter((t) => t.status === "open").length, 1);
      assert.equal(
        (await notifications()).length,
        notificationsBeforeCatchup + 1,
        "notify latest only",
      );
      await runPolicyReminders(p, "2026-12-04");
      assert.equal((await tasks()).length, 5);
      await p.updateGlobal({ slug: "workflow-settings", data: { enabledEvents: [] } });
      await mutateContent(p, reviewer, {
        action: "unpublish",
        id: draft.id,
        revision: draft.revision,
      });
      await runPolicyReminders(p, "2026-12-04");
      assert.equal(
        (await tasks()).filter((t) => t.status === "open").length,
        0,
        "disabling new reminders must not freeze withdrawal reconciliation",
      );
      console.log(
        "PASS formal-only, 30/7, concurrent/replay, scope, unassigned, versions, withdrawal, no mail",
      );
    } finally {
      for (const collection of [
        "workflow-notifications",
        "workflow-tasks",
        "workflow-events",
      ] as const)
        await p.delete({ collection, where: { contentDraft: { equals: draft.id } } });
    }
  });
} finally {
  if (flag === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = flag;
  await p.updateGlobal({
    slug: "workflow-settings",
    data: { emailEnabled: settings.emailEnabled, enabledEvents: settings.enabledEvents },
  });
  await p.destroy();
}
process.exit(0);
