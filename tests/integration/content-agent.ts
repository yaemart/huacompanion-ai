import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { agentAction, runTask } from "../../src/server/content-agent/service";
if (process.env.APP_ENV !== "local") throw Error("Local tests only");
const p = await getPayload({ config });
const user = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
try {
  const zh = (
    await p.find({
      collection: "content-drafts",
      where: { locale: { equals: "zh" } },
      limit: 1,
    })
  ).docs[0];
  const wrongLocale = await agentAction(p, user, {
    action: "create",
    title: "Locale test",
    kind: "draft",
    material: "Material",
    locale: "en",
    draftId: zh.id,
    revision: zh.revision,
    sources: [],
  });
  assert.equal((wrongLocale.input as any).locale, "zh");
  for (const targetLocale of ["en", "es", "fr", "de", "it", "ar"]) {
    const translation = await agentAction(p, user, {
      action: "create",
      title: "Explicit translation target",
      kind: "translate",
      material: "Public source material",
      draftId: zh.id,
      revision: zh.revision,
      targetLocale,
    });
    assert.equal((translation.input as any).locale, targetLocale);
    assert.equal((translation.input as any).source.locale, "zh");
  }
  for (const targetLocale of [undefined, "zh", "ja"]) {
    await assert.rejects(() =>
      agentAction(p, user, {
        action: "create",
        title: "Invalid translation target",
        kind: "translate",
        material: "Public source material",
        draftId: zh.id,
        revision: zh.revision,
        targetLocale,
      }),
    );
  }
  const task = await agentAction(p, user, {
    action: "create",
    title: "Test draft",
    kind: "draft",
    material: "Public test material",
    locale: "en",
    sources: [],
  });
  assert.equal(task.status, "unconfigured");
  await runTask(p, user, task.id);
  assert.equal(
    (await p.findByID({ collection: "content-agent-tasks", id: task.id })).status,
    "unconfigured",
  );
  const adapter = {
    name: "test-only",
    run: async () => ({
      result: {
        title: "Generated draft",
        blocks: [{ type: "paragraph", text: "Draft only" }],
        sourceIds: [],
        questions: ["Human review required"],
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    }),
  };
  await runTask(p, user, task.id, adapter, 100000);
  const done = await p.findByID({
    collection: "content-agent-tasks",
    id: task.id,
  });
  assert.equal(done.status, "succeeded");
  const adopted = await agentAction(p, user, { action: "adopt", id: task.id });
  const again = await agentAction(p, user, { action: "adopt", id: task.id });
  assert.equal(adopted.adoptedDraft, again.adoptedDraft);
  const draft = await p.findByID({
    collection: "content-drafts",
    id: adopted.adoptedDraft!,
  });
  assert.equal(draft.reviewState, "draft");
  assert.equal(draft.everPublished, false);
  const cancel = await agentAction(p, user, {
    action: "create",
    title: "Cancellation test",
    kind: "draft",
    material: "Material",
    locale: "en",
    sources: [],
  });
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  const wait = new Promise<void>((r) => (release = r));
  const pending = runTask(
    p,
    user,
    cancel.id,
    {
      name: "test-only",
      run: async () => {
        started();
        await wait;
        return adapter.run();
      },
    },
    100000,
  );
  await ready;
  await agentAction(p, user, { action: "cancel", id: cancel.id });
  await assert.rejects(() => runTask(p, user, task.id, adapter, 100000));
  const other = await agentAction(p, user, {
    action: "create",
    title: "Concurrent task",
    kind: "draft",
    material: "Material",
    locale: "en",
    sources: [],
  });
  await assert.rejects(() => runTask(p, user, other.id, adapter, 100000));
  release();
  await pending;
  assert.equal(
    (await p.findByID({ collection: "content-agent-tasks", id: cancel.id })).status,
    "cancelled",
  );
  console.log(
    "PASS missing configuration, candidate validation, adoption idempotency and late cancelled result isolation",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await p.destroy();
  process.exit(process.exitCode || 0);
}
