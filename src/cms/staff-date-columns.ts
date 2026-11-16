import type { Field } from "payload";

// Decorate sanitized fields, including Payload's own timestamp fields.
export function applyStaffDateColumns(fields: Field[]) {
  for (const field of fields) {
    if (field.type === "date" && !field.admin?.components?.Cell) {
      field.admin = {
        ...field.admin,
        components: { ...field.admin?.components, Cell: "/cms/StaffDateCell#StaffDateCell" },
      };
    } else if (field.type === "tabs") {
      for (const tab of field.tabs) applyStaffDateColumns(tab.fields);
    } else if ("fields" in field) {
      applyStaffDateColumns(field.fields);
    }
  }
}
