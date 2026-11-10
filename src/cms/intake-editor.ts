import type { Field } from "payload";

/** Nameless layout wrappers retain the original field paths and access functions. */
export function intakeEditorFields(fields: Field[], kind: "inquiry" | "provider"): Field[] {
  if (kind === "provider")
    fields = fields.map((field) =>
      field.type === "text" && ["languages", "city"].includes(field.name)
        ? {
            ...field,
            admin: {
              ...field.admin,
              components: { Field: "/cms/ProviderOptions#ProviderOptions" },
            },
          }
        : field,
    );
  const operations =
    kind === "inquiry"
      ? ["status", "owner", "nextFollowUp", "coordinationStage"]
      : ["status", "owner", "publicApproved"];
  const metadata = [
    "reference",
    "source",
    "locale",
    "consentAt",
    "privacyVersion",
    "catalogSource",
    "team",
  ];
  const selected = (names: string[]) =>
    names.flatMap((name) => fields.filter((f) => "name" in f && f.name === name));
  return [
    {
      type: "collapsible",
      label: "处理操作",
      admin: { initCollapsed: false },
      fields: [
        ...selected(operations),
        ...(kind === "inquiry"
          ? [
              {
                name: "serviceCaseAction",
                type: "ui" as const,
                admin: { components: { Field: "/cms/InquiryCase#InquiryCase" } },
              },
            ]
          : [
              {
                name: "providerReviewAction",
                type: "ui" as const,
                admin: { components: { Field: "/cms/ProviderReview#ProviderReview" } },
              },
            ]),
      ],
    },
    ...fields.filter((f) => !("name" in f) || ![...operations, ...metadata].includes(f.name)),
    {
      type: "collapsible",
      label: "提交来源与管理信息",
      admin: { initCollapsed: true },
      fields: selected(metadata),
    },
  ];
}
