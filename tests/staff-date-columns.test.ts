import assert from "node:assert/strict";
import { test } from "node:test";
import type { Field } from "payload";
import { applyStaffDateColumns } from "../src/cms/staff-date-columns.ts";

test("the date display preserves native timestamp definitions and field access", () => {
  const read = () => false;
  const fields: Field[] = [
    {
      type: "collapsible",
      label: "记录",
      fields: [
        {
          name: "nextFollowUp",
          type: "date",
          access: { read },
          admin: { date: { pickerAppearance: "dayAndTime" } },
        },
      ],
    },
    {
      name: "createdAt",
      type: "date",
      index: true,
      admin: { hidden: true, disableBulkEdit: true },
    },
  ];
  applyStaffDateColumns(fields);
  const [section, created] = fields;
  assert.equal(section.type, "collapsible");
  const date = section.fields[0];
  assert.equal(date.type, "date");
  assert.equal(date.access?.read, read);
  assert.equal(date.admin?.date?.pickerAppearance, "dayAndTime");
  assert.equal(date.admin?.components?.Cell, "/cms/StaffDateCell#StaffDateCell");
  assert.equal(created.type, "date");
  assert.deepEqual(created, {
    name: "createdAt",
    type: "date",
    index: true,
    admin: {
      hidden: true,
      disableBulkEdit: true,
      components: { Cell: "/cms/StaffDateCell#StaffDateCell" },
    },
  });
});

test("custom cells and non-date fields retain their definitions", () => {
  const fields: Field[] = [
    { name: "calendar", type: "date", admin: { components: { Cell: "/existing#Cell" } } },
    { name: "reference", type: "text" },
  ];
  const original = structuredClone(fields);
  applyStaffDateColumns(fields);
  assert.deepEqual(fields, original);
});
