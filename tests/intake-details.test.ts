import assert from "node:assert/strict";
import test from "node:test";
import { intakeDetailRows } from "../src/lib/intake-details.ts";

test("Chinese intake labels, categories and enum values preserve customer text", () => {
  const input = {
    name: "Demo Person",
    categories: ["business", "transport"],
    purpose: "  Hello\n客户原话 <script>alert(1)</script>  ",
    datesUnknown: false,
    consent: true,
    stayType: "long",
    homeServices: "regular,deep",
    homeEquipment: "confirm",
    channel: "whatsapp",
  };
  const before = structuredClone(input);
  const rows = intakeDetailRows(input);
  const row = (label: string) => rows.find((r) => r.label === label)?.value;
  assert.equal(row("联系人姓名"), "Demo Person");
  assert.equal(row("服务类别"), "展会与商务访问、接送机与交通");
  assert.equal(row("展会或访问目的"), input.purpose);
  assert.equal(row("日期尚未确定"), "否");
  assert.equal(row("已确认隐私告知"), "是");
  assert.equal(row("住宿类型"), "长期住宿");
  assert.equal(row("可提供子类"), "日常清洁、深度清洁");
  assert.equal(row("工具和用品由谁提供"), "待确认");
  assert.equal(row("首选联系渠道"), "WhatsApp");
  assert.deepEqual(input, before);
});
test("legacy unknown and nested values stay visible without JSON or coercion", () => {
  assert.deepEqual(intakeDetailRows(null), []);
  assert.deepEqual(intakeDetailRows({ empty: "", missing: null }), []);
  const rows = intakeDetailRows({ legacy: { count: 0, enabled: false, items: ["甲", "乙"] } });
  assert.deepEqual(
    rows.map((r) => r.value),
    ["0", "否", "甲、乙"],
  );
  assert.ok(rows.every((r) => r.label.startsWith("其他资料（legacy）")));
  assert.deepEqual(intakeDetailRows("旧说明"), [{ label: "原始资料", value: "旧说明" }]);
  assert.equal(intakeDetailRows({ stayType: "legacy-value" })[0].value, "legacy-value");
});
test("free text and prototype-like legacy keys remain literal", () => {
  const rows = intakeDetailRows(
    JSON.parse(
      '{"homeStaffing":"team","constructor":"说明","categories":["__proto__"],"stayType":"toString"}',
    ),
  );
  assert.deepEqual(
    rows.map((r) => r.value),
    ["team", "说明", "__proto__", "toString"],
  );
  assert.equal(rows[1].label, "其他资料（constructor）");
});
test("home enums are translated only for their actual field", () => {
  assert.deepEqual(
    intakeDetailRows({
      homeService: "company",
      homeFrequency: "provider",
      homeFlexible: "once",
    }).map((r) => r.value),
    ["company", "provider", "once"],
  );
});
test("invisible legacy values and empty array items do not create blank cards", () => {
  assert.deepEqual(intakeDetailRows({ notes: "  \n\t", legacy: ["", "  "] }), []);
  assert.equal(intakeDetailRows({ legacy: ["", "  甲  ", ""] })[0].value, "  甲  ");
});
