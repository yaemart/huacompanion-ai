import { test } from "node:test";
import { StaffFormError, staffFormMessage } from "../src/lib/staff-form-feedback.ts";
import assert from "node:assert/strict";
import {
  emptyExhibition,
  validateExhibition,
  publicExhibition,
  type Exhibition,
} from "../src/lib/exhibitions.ts";

// This literal deliberately has none of the new keys: it represents an existing stored snapshot.
const legacy = (): Exhibition => ({
  edition: "Fictional 2090",
  city: "shanghai",
  venue: "Fictional hall",
  address: "Fictional address",
  addressEn: "",
  startDate: "2090-01-30",
  endDate: "2090-02-02",
  audience: "Trade buyers",
  exhibits: "Fictional hardware",
  admission: "Official registration",
  officialURL: "https://example.invalid/show",
  registrationURL: "",
  verifiedAt: "2026-10-01",
  unresolved: "",
  industries: ["hardware"],
  status: "announced",
  projectKeys: [],
});
const phase = () => ({
  name: "Fictional phase",
  startDate: "2090-01-31",
  endDate: "2090-02-01",
  theme: "Fictional tools",
});
const details = () => ({
  ...legacy(),
  phases: [phase()],
  transport: "Fictional transit\nCheck entrance",
  buyerRegistration: "Fictional buyer instructions",
  stayAreas: "Fictional area",
  firstVisitTips: "Fictional first visit",
});
test("legacy snapshots remain publishable without backfilling stored visitor fields", () => {
  const old = legacy(),
    before = structuredClone(old);
  assert.doesNotThrow(() => validateExhibition(old, true));
  const view = publicExhibition(old);
  assert.deepEqual(view.phases, []);
  assert.equal(view.transport, "");
  assert.deepEqual(old, before);
  assert.deepEqual(emptyExhibition().phases, []);
});
test("public projection preserves visitor facts but strips nested internal attributes without aliasing", () => {
  const raw = {
    ...details(),
    secret: "PRIVATE",
    phases: [{ ...phase(), staffNote: "PRIVATE", providerId: 99 }],
  };
  const view = publicExhibition(raw);
  assert.deepEqual(view.phases, [
    {
      name: "Fictional phase",
      startDate: "2090-01-31",
      endDate: "2090-02-01",
      theme: "Fictional tools",
    },
  ]);
  assert.equal(view.transport, "Fictional transit\nCheck entrance");
  assert.equal(view.buyerRegistration, "Fictional buyer instructions");
  assert.equal(view.stayAreas, "Fictional area");
  assert.equal(view.firstVisitTips, "Fictional first visit");
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE|providerId|staffNote/);
  view.phases![0].theme = "Changed output";
  assert.equal(raw.phases[0].theme, "Fictional tools");
});
test("visitor field and phase limits accept their exact boundaries", () => {
  assert.doesNotThrow(() =>
    validateExhibition(
      {
        ...details(),
        phases: Array.from({ length: 12 }, () => ({
          ...phase(),
          name: "n".repeat(200),
          theme: "t".repeat(2000),
        })),
        transport: "t".repeat(5000),
        buyerRegistration: "r".repeat(5000),
        stayAreas: "s".repeat(5000),
        firstVisitTips: "f".repeat(5000),
      },
      true,
    ),
  );
});
for (const [label, patch] of [
  ["too many phases", { phases: Array.from({ length: 13 }, phase) }],
  ["null phases", { phases: null }],
  ["object phases", { phases: {} }],
  ["primitive phase", { phases: ["bad"] }],
  ["null phase", { phases: [null] }],
  ["missing phase field", { phases: [{ name: "only name" }] }],
  ["long phase name", { phases: [{ ...phase(), name: "n".repeat(201) }] }],
  ["long phase theme", { phases: [{ ...phase(), theme: "t".repeat(2001) }] }],
  ["non-string phase theme", { phases: [{ ...phase(), theme: 3 }] }],
  ["null visitor text", { transport: null }],
  ["non-string visitor text", { stayAreas: [] }],
  ["long transport", { transport: "t".repeat(5001) }],
  ["long buyer registration", { buyerRegistration: "r".repeat(5001) }],
  ["long stay areas", { stayAreas: "s".repeat(5001) }],
  ["long first visit tips", { firstVisitTips: "f".repeat(5001) }],
] as const)
  test("rejects " + label, () =>
    assert.throws(() => validateExhibition({ ...details(), ...patch } as unknown as Exhibition)),
  );
for (const [label, dates] of [
  ["rollover date", { startDate: "2090-02-30", endDate: "2090-02-30" }],
  ["partial date", { startDate: "2090-1-31", endDate: "2090-02-01" }],
  ["one missing date", { startDate: "2090-01-31", endDate: "" }],
  ["reversed phase", { startDate: "2090-02-01", endDate: "2090-01-31" }],
  ["before overall start", { startDate: "2090-01-29", endDate: "2090-01-31" }],
  ["after overall end", { startDate: "2090-02-01", endDate: "2090-02-03" }],
] as const)
  test("rejects " + label, () =>
    assert.throws(() => validateExhibition({ ...details(), phases: [{ ...phase(), ...dates }] })),
  );
test("draft phase rows may be incomplete but publication requires names and themes", () => {
  for (const fields of [
    { name: "", theme: "" },
    { name: " ", theme: "Tools" },
    { name: "Phase", theme: "\n" },
  ]) {
    const event = { ...details(), phases: [{ ...phase(), ...fields }] };
    assert.doesNotThrow(() => validateExhibition(event));
    assert.throws(() => validateExhibition(event, true));
  }
});
test("unknown phase dates, valid leap days, overlapping phases and input order are preserved", () => {
  const event = {
    ...details(),
    startDate: "2028-02-28",
    endDate: "2028-03-02",
    phases: [
      { ...phase(), name: "B", startDate: "2028-02-29", endDate: "2028-03-01" },
      { ...phase(), name: "A", startDate: "2028-02-28", endDate: "2028-03-01" },
      { ...phase(), name: "Dates pending", startDate: "", endDate: "" },
    ],
  };
  assert.doesNotThrow(() => validateExhibition(event, true));
  assert.deepEqual(
    publicExhibition(event).phases!.map((p) => p.name),
    ["B", "A", "Dates pending"],
  );
  assert.doesNotThrow(() =>
    validateExhibition(
      {
        ...event,
        status: "pending",
        startDate: "",
        endDate: "",
        unresolved: "Overall dates pending",
      },
      true,
    ),
  );
  assert.throws(() => validateExhibition({ ...event, endDate: "2028-02-29" }));
});
const correctionCases: [string, Exhibition, boolean, RegExp][] = [
  ["out of range", { ...details(), endDate: "2090-01-30" }, false, /第1期.*总体展期/],
  ["partial date", { ...details(), phases: [{ ...phase(), endDate: "" }] }, false, /第1期.*日期/],
  [
    "blank second theme",
    { ...details(), phases: [phase(), { ...phase(), theme: "" }] },
    true,
    /第2期.*题材/,
  ],
  ["long transit", { ...details(), transport: "t".repeat(5001) }, false, /交通.*5000/],
  [
    "long buyer instructions",
    { ...details(), buyerRegistration: "b".repeat(5001) },
    false,
    /外国买家登记.*5000/,
  ],
];
for (const [label, event, publishing, expected] of correctionCases)
  test("staff can correct " + label + " without exposing unexpected errors", () => {
    assert.throws(
      () => validateExhibition(event, publishing),
      (error) =>
        error instanceof StaffFormError &&
        expected.test(staffFormMessage(error, "Unexpected failure")),
    );
  });
