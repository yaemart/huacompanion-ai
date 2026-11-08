import { test } from "node:test";
import assert from "node:assert/strict";
import { publicCompany } from "../src/lib/public-company.ts";
test("unconfigured and whitespace-only company details stay hidden", () => {
  assert.equal(publicCompany({}, "en"), null);
  assert.equal(publicCompany({ companyName: "  ", email: null }, "zh"), null);
});
test("company facts are an explicit public whitelist with language-specific locations", () => {
  const data = {
    companyName: " Fictional fixture only ",
    locationZh: "虚构地点",
    locationEn: " Fictional place ",
    email: "demo@example.invalid",
    phone: "+00 000",
    id: 10,
    internalNote: "private",
  };
  assert.deepEqual(publicCompany(data, "en"), {
    companyName: "Fictional fixture only",
    location: "Fictional place",
    email: "demo@example.invalid",
    phone: "+00 000",
  });
  assert.equal(publicCompany(data, "zh")?.location, "虚构地点");
  assert.equal(publicCompany({ locationZh: "虚构地点" }, "en"), null);
  assert.equal(publicCompany({ locationEn: "Fictional place" }, "zh"), null);
  assert.deepEqual(publicCompany({ phone: " 123 " }, "zh"), { phone: "123" });
});
