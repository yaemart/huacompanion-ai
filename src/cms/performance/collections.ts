import type { CollectionConfig, Field } from "payload";
import {
  appealResults,
  incidentResponsibilities,
  incidentRoles,
  incidentSources,
  incidentStatuses,
} from "../../lib/performance-incidents.ts";

const closed = () => false;
const access = { admin: closed, read: closed, create: closed, update: closed, delete: closed };
const base = { access, admin: { hidden: true }, lockDocuments: false as const };
const number = (name: string, required = false, index = false): Field => ({
  name,
  type: "number",
  min: 1,
  required,
  index,
});
const text = (name: string, maxLength: number, required = false): Field => ({
  name,
  type: "textarea",
  maxLength,
  required,
});
const date = (name: string, required = false): Field => ({ name, type: "date", required });
const select = (name: string, options: readonly string[], required = false): Field => ({
  name,
  type: "select",
  options: [...options],
  required,
});

export const performanceCollections: CollectionConfig[] = [
  {
    ...base,
    slug: "performance-incidents",
    typescript: { interface: "PerformanceIncident" },
    fields: [
      { name: "key", type: "text", required: true, unique: true },
      select("source", incidentSources, true),
      number("sourceRecord", true),
      number("sourceVersion", true),
      number("sourceRevision"),
      text("sourceLocale", 8),
      text("issueField", 40),
      text("title", 200, true),
      text("evidence", 4000, true),
      date("occurredAt", true),
      number("reportedBy", true, true),
      { name: "participants", type: "json", required: true },
      number("sourceTeam"),
      { name: "completeHistory", type: "checkbox", required: true, defaultValue: false },
      number("relatedIncident"),
      number("duplicateOf"),
      select("state", incidentStatuses, true),
      select("responsibility", incidentResponsibilities),
      number("decidedBy"),
      date("firstConfirmedAt"),
      text("decisionReason", 2000),
    ],
  },
  {
    ...base,
    slug: "performance-findings",
    typescript: { interface: "PerformanceFinding" },
    indexes: [{ fields: ["incident", "staff"], unique: true }],
    fields: [
      {
        name: "incident",
        type: "relationship",
        relationTo: "performance-incidents",
        required: true,
      },
      { name: "staff", type: "relationship", relationTo: "staff", required: true, index: true },
      select("duty", incidentRoles, true),
      text("summary", 1000, true),
      { name: "active", type: "checkbox", required: true, defaultValue: true },
      date("notifiedAt", true),
      date("appealAt"),
      text("appealReason", 2000),
      select("result", appealResults),
      date("resolvedAt"),
      number("resolvedBy"),
      text("resolution", 1000),
    ],
  },
];
