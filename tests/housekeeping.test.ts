import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHousekeeping,
  validateHousekeeping,
  publicHousekeeping,
  validateHomeIntake,
} from "../src/lib/housekeeping.ts";
test("housekeeping public projection strips private data and requires verified descriptions", () => {
  const h = emptyHousekeeping();
  validateHousekeeping(h);
  assert.throws(() => validateHousekeeping(h, true));
  assert.equal("contact" in publicHousekeeping({ ...h, contact: "private" } as any), false);
  assert.throws(() => validateHousekeeping({ ...h, services: ["nursing"] } as any));
});
test("home intake rejects invalid area and hidden-only fields are not required", () => {
  assert.ok(
    validateHomeIntake("request", { homeService: "regular", homeArea: "-1" }, "en").homeArea,
  );
  assert.deepEqual(
    validateHomeIntake(
      "request",
      {
        homeService: "regular",
        homeDistrict: "Pudong",
        homeArea: "80",
        homeRooms: "2",
        homeBathrooms: "1",
        homeFlexible: "yes",
        homeFrequency: "once",
        homeEquipment: "confirm",
      },
      "en",
    ),
    {},
  );
});
