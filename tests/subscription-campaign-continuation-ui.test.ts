import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Tree = { type: string; props: Record<string, unknown> };
const source = ts.transpileModule(
  readFileSync(
    new URL("../src/components/subscriptions/CampaignContinuation.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function mount(loseResponse = false) {
  const cells: unknown[] = [],
    requests: boolean[] = [];
  let position = 0,
    busy = false,
    blocked = false,
    navigations = 0;
  const receipt = {
    campaignKey: "fictional",
    revision: 2,
    originalRevision: 1,
    bound: 1,
    continuedAt: "2030-01-01T00:00:00.000Z",
    replayed: true,
  };
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      useState(value: unknown) {
        const i = position++;
        if (!(i in cells)) cells[i] = value;
        return [
          cells[i],
          (next: unknown) => {
            cells[i] = next;
          },
        ];
      },
      useRef(value: unknown) {
        const i = position++;
        return (cells[i] ??= { current: value });
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/lib/staff-display": { staffDateTime: () => "fictional time" },
    "@/lib/subscription-campaign-task-client": { MockTaskRequestError: class extends Error {} },
    "@/lib/subscription-campaign-continuation-client": {
      continuationRequest: async (_draft: unknown, readOnly = false) => {
        requests.push(readOnly);
        if (loseResponse && !readOnly) throw Error("fictional lost response");
        return receipt;
      },
    },
  };
  const context = {
    exports: {} as Record<string, unknown>,
    require: (name: string) => modules[name],
    window: {
      location: {
        assign() {
          navigations++;
        },
      },
    },
  };
  runInNewContext(source, context);
  const draw = () => {
    position = 0;
    const block = (value: boolean) => {
      blocked = value;
    };
    return (context.exports.CampaignContinuation as (props: object) => Tree)({
      draft: { campaignKey: "fictional", revision: 2 },
      initial: null,
      eligible: true,
      disabled: false,
      onBusyChange: (value: boolean) => {
        busy = value;
      },
      // Both names allow this behavioral regression to run against the pre-fix component.
      onUncertainChange: block,
      onBlockedChange: block,
    });
  };
  function find(value: unknown, type: string, label?: string): Tree | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Tree;
    if (node.type === type && (!label || node.props.children === label)) return node;
    for (const child of [node.props.children].flat()) {
      const found = find(child, type, label);
      if (found) return found;
    }
  }
  const node = (type: string, label?: string) => {
    const found = find(draw(), type, label);
    assert.ok(found, `missing ${type} ${label ?? ""}`);
    return found;
  };
  const submit = async () => {
    (node("input").props.onChange as (event: object) => void)({ target: { checked: true } });
    (node("form").props.onSubmit as (event: object) => void)({ preventDefault() {} });
    await flush();
  };
  const click = async (label: string) => {
    await (node("button", label).props.onClick as () => Promise<void> | void)();
    await flush();
  };
  return { node, submit, click, state: () => ({ busy, blocked, navigations, requests }) };
}

test("successful submit keeps old page locked until navigation actually unloads it", async () => {
  const ui = mount();
  await ui.submit();
  assert.equal(ui.state().navigations, 1);
  assert.equal(ui.state().busy, true, "location.assign alone has not unloaded the document");
  assert.equal(ui.node("fieldset").props.disabled, true);
  await ui.submit();
  assert.deepEqual(
    ui.state().requests,
    [false],
    "even an Enter event cannot start another mutation",
  );
});
test("readonly recovery displays the receipt without navigation; explicit reopen stays locked", async () => {
  const ui = mount(true);
  await ui.submit();
  assert.equal(ui.state().blocked, true);
  await ui.click("只读核实本版续发");
  assert.equal(
    ui.state().navigations,
    0,
    "readonly recovery must not invoke the page's mock-reset side effect",
  );
  assert.equal(
    ui.state().blocked,
    true,
    "a recovered receipt is not fresh page execution authorization",
  );
  assert.deepEqual(ui.state().requests, [false, true]);
  await ui.click("重新打开本版活动");
  assert.equal(ui.state().navigations, 1);
  assert.equal(ui.state().busy, true);
});
