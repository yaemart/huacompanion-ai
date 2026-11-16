"use client";

import { RenderDefaultCell } from "@payloadcms/ui";
import type { DateFieldClient, DefaultCellComponentProps } from "payload";
import { staffDate, staffDateTime } from "../lib/staff-display";

export function StaffDateCell({
  cellData,
  columnIndex = 0,
  field,
  ...props
}: DefaultCellComponentProps<DateFieldClient, string | Date | number | null>) {
  const configuredDate = field.admin?.date;
  const appearance =
    typeof configuredDate === "object" && configuredDate && "pickerAppearance" in configuredDate
      ? configuredDate.pickerAppearance
      : undefined;
  const showClock =
    appearance === "dayAndTime" ||
    appearance === "timeOnly" ||
    props.collectionSlug === "audit-events";
  const value = typeof cellData === "number" ? new Date(cellData) : cellData;
  return (
    <RenderDefaultCell
      clientProps={{
        ...props,
        field: { name: field.name, label: field.label, type: "text" },
        cellData: showClock
          ? staffDateTime(value, props.collectionSlug === "audit-events")
          : staffDate(value),
      }}
      columnIndex={columnIndex}
      isLinkedColumn={props.link}
    />
  );
}
