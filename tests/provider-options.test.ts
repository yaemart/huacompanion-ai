import assert from "node:assert/strict";
import { test } from "node:test";
import { providerOptions, providerOptionValue } from "../src/lib/provider-options.ts";

test("旧语言别名自动选中，未知原文保留，不猜测整段文字", () => {
  assert.deepEqual(providerOptions("languages", "English、中文;EN/日语"), {
    selected: ["zh", "en"],
    unresolved: ["日语"],
  });
  assert.deepEqual(providerOptions("languages", "English and Mandarin"), {
    selected: [],
    unresolved: ["English and Mandarin"],
  });
  assert.deepEqual(providerOptions("languages", "英语,汉语,德语"), {
    selected: ["zh", "en", "de"],
    unresolved: [],
  });
});

test("区域识别目录所有现有别名，去重但不擅自把周边扩成城市", () => {
  assert.deepEqual(providerOptions("city", "Shanghai,上海；杭州|北京/上海及周边"), {
    selected: ["shanghai", "beijing", "hangzhou"],
    unresolved: ["上海及周边"],
  });
  assert.deepEqual(providerOptions("city", "Shanghái\nPekín"), {
    selected: ["shanghai", "beijing"],
    unresolved: [],
  });
});

test("写回标准中文并保留未知内容，只能显式移除旧值", () => {
  assert.equal(providerOptionValue("languages", ["en", "zh", "en"], ["日语"]), "中文、英文、日语");
  assert.equal(providerOptionValue("city", ["beijing"], ["上海及周边"]), "北京、上海及周边");
  assert.equal(providerOptionValue("languages", [], []), "");
  assert.throws(() => providerOptionValue("city", ["invented"], []), /标准/);
});

test("与对象原型同名的未知内容不能被误认为标准语言而丢失", () => {
  assert.deepEqual(providerOptions("languages", "constructor,__proto__,toString"), {
    selected: [],
    unresolved: ["constructor", "__proto__", "toString"],
  });
});
