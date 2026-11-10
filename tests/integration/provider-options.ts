import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { providerOptions, providerOptionValue } from "../../src/lib/provider-options";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_provider_options_e4_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config }),
  run = `e4-${randomUUID()}`,
  password = randomUUID(),
  staffIDs: number[] = [],
  teamIDs: number[] = [];
let providerID: number | undefined;
try {
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}@example.invalid`, password, role: "admin" },
  });
  staffIDs.push(admin.id);
  const team = await p.create({ collection: "teams", user: admin, data: { name: run } });
  const foreign = await p.create({ collection: "teams", user: admin, data: { name: run + "f" } });
  teamIDs.push(team.id, foreign.id);
  const makeStaff = async (name: string, role: "operations" | "manager", teamID: number) => {
    const staff = await p.create({
      collection: "staff",
      user: admin,
      data: { name, email: `${run}-${name}@example.invalid`, password, role, team: teamID },
    });
    staffIDs.push(staff.id);
    return staff;
  };
  const op = await makeStaff("op", "operations", team.id),
    other = await makeStaff("other", "operations", team.id),
    manager = await makeStaff("manager", "manager", team.id),
    outsider = await makeStaff("outside", "manager", foreign.id);
  const row = await p.create({
    collection: "providers",
    user: admin,
    data: {
      reference: run,
      name: "虚构测试联系人",
      email: "fake@example.invalid",
      city: "Shanghai、上海及周边",
      languages: "English,日语",
      organisation: "虚构E4机构",
      phone: "000000000",
      capabilities: "演示能力，不可用于真实服务",
      categories: ["business"],
      status: "applied",
      team: team.id,
      owner: op.id,
      notes: "旧备注原文",
      details: { city: "原始上海", languages: "原始自由文本" },
      contentHash: run,
      requestKey: randomUUID(),
    },
  });
  providerID = row.id;
  const read = () => p.findByID({ collection: "providers", id: row.id, depth: 0 });
  const update = (data: Record<string, unknown>, user = op) =>
    p.update({ collection: "providers", id: row.id, data, user, overrideAccess: false });
  await update({ name: "只改联系人" });
  assert.equal((await read()).languages, "English,日语");
  assert.equal((await read()).city, "Shanghai、上海及周边");
  const languages = providerOptions("languages", row.languages),
    cities = providerOptions("city", row.city);
  await update({
    languages: providerOptionValue(
      "languages",
      [...languages.selected, "zh"],
      languages.unresolved,
    ),
    city: providerOptionValue("city", [...cities.selected, "beijing"], cities.unresolved),
    status: "verified",
    publicApproved: true,
  });
  let saved = await read();
  assert.equal(saved.languages, "中文、英文、日语");
  assert.equal(saved.city, "上海、北京、上海及周边");
  assert.equal(saved.status, "applied");
  assert.equal(saved.publicApproved, false);
  assert.deepEqual(saved.details, row.details);
  assert.deepEqual(saved.followUps, row.followUps);
  assert.equal(saved.notes, "旧备注原文");
  await update({ city: "北京" }, manager);
  for (const user of [other, outsider])
    await assert.rejects(() => update({ languages: "中文" }, user));
  await assert.rejects(() => update({ languages: "" }));
  await assert.rejects(() => update({ city: "" }));
  saved = await read();
  assert.equal(saved.languages, "中文、英文、日语");
  assert.equal(saved.city, "北京");
  const versions = await p.findVersions({
    collection: "providers",
    where: { parent: { equals: row.id } },
    pagination: false,
  });
  assert.ok(versions.docs.some((v) => v.version.languages === "English,日语"));
  const audits = await p.find({
    collection: "audit-events",
    where: { and: [{ entity: { equals: "providers" } }, { recordId: { equals: String(row.id) } }] },
    pagination: false,
  });
  assert.ok(audits.docs.some((a) => a.fields?.includes("languages")));
  console.log(
    "PASS provider option save/reload, legacy retention, versions, scope and unchanged status/public boundaries",
  );
} finally {
  if (providerID) await p.delete({ collection: "providers", id: providerID });
  for (const id of staffIDs.reverse()) await p.delete({ collection: "staff", id });
  for (const id of teamIDs) await p.delete({ collection: "teams", id });
  await p.destroy();
}
process.exit(0);
