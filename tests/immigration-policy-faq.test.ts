import test from "node:test";
import assert from "node:assert/strict";
import type { ContentBody } from "../src/lib/content-model.ts";
import { selectPolicyFAQs } from "../src/lib/immigration-policy-faq.ts";

const faq = (patch: Partial<ContentBody> = {}): ContentBody => ({
  contentKey: "visa-faq-test",
  slug: "visa-faq-test",
  kind: "faq",
  locale: "en",
  title: "Fictional question?",
  blocks: [{ type: "paragraph", text: "Fictional answer." }],
  sources: [
    {
      id: "test",
      title: "Fictional source",
      url: "https://example.invalid/faq",
      checkedAt: "2026-11-01",
    },
  ],
  ...patch,
});
const select = (items: ContentBody[], keys: string | undefined = "visa-faq-test") =>
  selectPolicyFAQs(items, "en", keys, "2026-11-01");

test("FAQ requires configured exact formal identity, language, kind and unambiguous key", () => {
  assert.deepEqual(selectPolicyFAQs([faq()], "en", undefined, "2026-11-01"), []);
  assert.deepEqual(select([faq()], ""), []);
  assert.deepEqual(select([faq()], "visa-faq"), []);
  assert.deepEqual(select([faq({ locale: "zh" })]), []);
  assert.deepEqual(select([faq({ kind: "guide" })]), []);
  assert.deepEqual(select([faq(), faq()]), []);
  assert.equal(select([faq()], " visa-faq-test,visa-faq-test ").length, 1);
});

test("FAQ rejects unchecked, unsafe and future sources rather than inventing verification", () => {
  for (const source of [
    { checkedAt: undefined },
    { checkedAt: "2026-02-30" },
    { checkedAt: "2026-11-02" },
    { url: "javascript:alert(1)" },
    { url: "http://example.invalid/faq" },
    { url: "https://user:secret@example.invalid/faq" },
    { title: " " },
  ])
    assert.deepEqual(select([faq({ sources: [{ ...faq().sources[0], ...source }] })]), []);
  assert.deepEqual(select([faq({ sources: [] })]), []);
  assert.deepEqual(selectPolicyFAQs([faq()], "en", "visa-faq-test", "bad"), []);
});

test("FAQ publishes the entire supported text answer, never silently drops image or link blocks", () => {
  assert.equal(
    select([
      faq({
        blocks: [
          { type: "heading", text: "A" },
          { type: "list", text: "B\nC" },
        ],
      }),
    ])[0].answer,
    "A\n\nB\nC",
  );
  for (const blocks of [
    [],
    [{ type: "paragraph" as const, text: " " }],
    [{ type: "image" as const, mediaId: 1 }],
    [{ type: "link" as const, text: "Go", url: "https://example.invalid" }],
  ])
    assert.deepEqual(select([faq({ blocks })]), []);
});

test("FAQ returns detached public fields in configured order without changing input", () => {
  const input = faq();
  Object.freeze(input.sources[0]);
  Object.freeze(input.sources);
  Object.freeze(input.blocks[0]);
  Object.freeze(input.blocks);
  Object.freeze(input);
  const result = select(
    [input, faq({ contentKey: "second", title: "Second?" })],
    "second,visa-faq-test",
  );
  assert.deepEqual(
    result.map((f) => f.question),
    ["Second?", "Fictional question?"],
  );
  assert.deepEqual(Object.keys(result[1]).sort(), ["answer", "key", "question", "sources"]);
  assert.deepEqual(Object.keys(result[1].sources[0]).sort(), ["checkedAt", "title", "url"]);
  result[1].sources[0].title = "Changed";
  assert.equal(input.sources[0].title, "Fictional source");
});
