import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_client_d3_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
const base = process.env.APP_URL || "http://127.0.0.1:3000";
if (
  process.env.APP_ENV !== "local" ||
  url.hostname !== "127.0.0.1" ||
  (!clone && !ci) ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error("Disposable D3 clone or CI HTTP only");
const p = await getPayload({ config });
const admin = (
  await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
).docs[0];
assert.ok(admin);
const original = await p.findGlobal({ slug: "public-company-settings", depth: 0 });
const originalFields = {
  companyName: original.companyName,
  locationZh: original.locationZh,
  locationEn: original.locationEn,
  email: original.email,
  phone: original.phone,
};
const blank = { companyName: "", locationZh: "", locationEn: "", email: "", phone: "" };
const html = async (locale: string) => {
  const r = await fetch(base + "/" + locale);
  assert.equal(r.status, 200);
  return (await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
};
try {
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    overrideAccess: false,
    data: blank,
  });
  for (const locale of ["en", "zh"]) {
    const page = await html(locale);
    assert.doesNotMatch(page, /data-company-info|HUA COMPANION · SHANGHAI/);
  }
  assert.equal((await fetch(base + "/api/globals/public-company-settings")).status, 403);
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    overrideAccess: false,
    data: {
      companyName: "DEMO · Fictional company",
      locationZh: "虚构测试地点",
      locationEn: "Fictional place",
      email: "demo@example.invalid",
      phone: "+00 000",
    },
  });
  for (const [locale, expected, other] of [
    ["en", "Fictional place", "虚构测试地点"],
    ["zh", "虚构测试地点", "Fictional place"],
  ]) {
    const page = await html(locale);
    const block = page.match(/<aside[^>]*data-company-info[^>]*>[\s\S]*?<\/aside>/)?.[0] || "";
    assert.match(block, /DEMO · Fictional company/);
    assert.ok(block.includes(expected));
    assert.ok(!block.includes(other));
    assert.match(block, /href="mailto:demo@example.invalid"/);
    assert.match(block, /\+00 000/);
    assert.doesNotMatch(block, /createdAt|updatedAt|internal/);
  }
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    overrideAccess: false,
    data: blank,
  });
  for (const locale of ["en", "zh"])
    assert.doesNotMatch(await html(locale), /data-company-info|DEMO · Fictional company/);
  console.log(
    "PASS production HTTP empty/configured/cleared, bilingual whitelist and anonymous API denied",
  );
} finally {
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    overrideAccess: false,
    data: originalFields,
  });
  await p.destroy();
}
process.exit(0);
