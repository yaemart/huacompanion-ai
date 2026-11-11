import assert from "node:assert/strict";
import { test } from "node:test";
import { plainArticle, readArticle } from "../src/lib/content-article.ts";

function text(value: string) {
  return { nodeType: 3, nodeValue: value, textContent: value } as Node;
}

function element(tagName: string, children: Node[], attrs: Record<string, string> = {}) {
  return {
    nodeType: 1,
    tagName,
    childNodes: children,
    textContent: children.map((child) => child.textContent ?? "").join(""),
    getAttribute: (name: string) => attrs[name] ?? null,
  } as unknown as Element;
}

test("rich clipboard maps paragraphs, headings, lists and inline links to published blocks", () => {
  const article = element("DIV", [
    element("H2", [text("抵达前")]),
    element("P", [text("带上纸质行程。"), element("BR", []), text("也保留离线副本。")]),
    element("UL", [
      element("LI", [text("第一项")]),
      element("LI", [element("SPAN", [text("第二项")])]),
    ]),
    element("P", [
      text("请参考"),
      element("A", [text("会展须知")], { href: "https://example.org/guide" }),
      text("并核对出发时间。"),
    ]),
  ]);
  assert.deepEqual(readArticle(article), {
    blocks: [
      { type: "heading", text: "抵达前" },
      { type: "paragraph", text: "带上纸质行程。\n也保留离线副本。" },
      { type: "list", text: "第一项\n第二项" },
      { type: "paragraph", text: "请参考" },
      { type: "link", text: "会展须知", url: "https://example.org/guide" },
      { type: "paragraph", text: "并核对出发时间。" },
    ],
    simplified: true,
  });
});

test("Word paragraph headings and lists preserve their text without duplicating bullet markers", () => {
  const article = element("DIV", [
    element("P", [text("行前清单")], { class: "MsoHeading2" }),
    element("P", [element("SPAN", [text("• ")], { style: "mso-list:Ignore" }), text("第一项")], {
      style: "mso-list:l0 level1 lfo1",
    }),
    element("P", [text("第二项")], { style: "mso-list:l0 level2 lfo1" }),
  ]);
  assert.deepEqual(readArticle(article), {
    blocks: [
      { type: "heading", text: "行前清单" },
      { type: "list", text: "第一项\n第二项" },
    ],
    simplified: true,
  });
});

test("unsupported content is simplified without importing external elements or unsafe URLs", () => {
  const article = element("DIV", [
    element("STYLE", [text("not article text")]),
    element("IMG", [], { src: "https://example.org/photo", alt: "原图说明" }),
    element("TABLE", [
      element("TR", [element("TD", [text("展馆")]), element("TD", [text("时间")])]),
    ]),
    element("OL", [
      element("LI", [
        text("第一级"),
        element("UL", [element("LI", [text("第二级")])]),
        text("末尾"),
      ]),
    ]),
    element("P", [
      text("联系"),
      element("A", [text("邮箱")], { href: "mailto:guide@example.org" }),
      text("及"),
      element("A", [text("旧页面")], { href: "/old" }),
    ]),
  ]);
  assert.deepEqual(readArticle(article), {
    blocks: [
      { type: "paragraph", text: "原图说明" },
      { type: "paragraph", text: "展馆" },
      { type: "paragraph", text: "时间" },
      { type: "list", text: "第一级\n第二级\n末尾" },
      { type: "paragraph", text: "联系邮箱及旧页面" },
    ],
    simplified: true,
  });
});

test("plain clipboard preserves words and leaves limits to the existing validator", () => {
  assert.deepEqual(plainArticle("第一段\r\n\r\nSecond paragraph\r末段"), [
    { type: "paragraph", text: "第一段" },
    { type: "paragraph", text: "Second paragraph" },
    { type: "paragraph", text: "末段" },
  ]);
  const long = "长".repeat(10_001);
  assert.deepEqual(plainArticle(long), [{ type: "paragraph", text: long }]);
});

test("linked images retain their readable label and list soft breaks do not create extra items", () => {
  const article = element("DIV", [
    element("A", [element("IMG", [], { alt: "展馆接驳图" })], { href: "https://example.org/map" }),
    element("UL", [element("LI", [text("路线"), element("BR", []), text("见下方")])]),
  ]);
  assert.deepEqual(readArticle(article), {
    blocks: [
      { type: "link", text: "展馆接驳图", url: "https://example.org/map" },
      { type: "list", text: "路线 见下方" },
    ],
    simplified: true,
  });
});

test("editing nearby text preserves unchanged legacy whitespace and blank list items", () => {
  const paragraph = element("P", [text("\n保留原段落  \n")]);
  const list = element("UL", [element("LI", [text("原条目")]), element("LI", [])]);
  const originals = new WeakMap([
    [
      paragraph,
      { html: paragraph.outerHTML, block: { type: "paragraph", text: "\n保留原段落  \n" } },
    ],
    [list, { html: list.outerHTML, block: { type: "list", text: "原条目\n" } }],
  ] as const);
  const article = element("DIV", [paragraph, list, element("P", [text("改后")])]);
  assert.deepEqual(readArticle(article, originals).blocks, [
    { type: "paragraph", text: "\n保留原段落  \n" },
    { type: "list", text: "原条目\n" },
    { type: "paragraph", text: "改后" },
  ]);
});
