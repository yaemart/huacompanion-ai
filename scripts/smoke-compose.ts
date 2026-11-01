import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { getPayload } from "payload";
import sharp from "sharp";
import config from "../src/payload.config";
import { saveIntake } from "../src/server/intake";
import { configureTrial } from "../src/server/trial-config";

const database = new URL(process.env.DATABASE_URL || "");
if (
  process.env.HUA_COMPOSE_SMOKE !== "true" ||
  process.env.APP_ENV !== "trial" ||
  database.hostname !== "db" ||
  database.pathname !== "/hua_companion" ||
  process.env.APP_URL !== "http://127.0.0.1:3001"
)
  throw Error("Only the isolated local Compose fixture environment is allowed");
const base = "http://127.0.0.1:3000";
const origin = process.env.APP_URL;
const p = await getPayload({ config });
const run = randomUUID();
const password = randomBytes(30).toString("base64url");
const bootstrapEnv = {
  ...process.env,
  BOOTSTRAP_ADMIN_EMAIL: "compose-admin@example.invalid",
  BOOTSTRAP_ADMIN_PASSWORD: password,
};
const bootstrap = () =>
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/bootstrap-admin.ts", "--apply"],
    { env: bootstrapEnv, stdio: "pipe" },
  ).toString();
try {
  const initial = await p.count({ collection: "staff" });
  if (initial.totalDocs === 0) assert.match(bootstrap(), /created/);
  const before = await p.count({ collection: "staff" });
  assert.match(bootstrap(), /no accounts or passwords changed/);
  assert.equal((await p.count({ collection: "staff" })).totalDocs, before.totalDocs);
  const admin = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs[0];
  assert.ok(admin);
  await configureTrial(p, process.env, true);
  const operatorPassword = randomBytes(30).toString("base64url");
  const operators = [];
  for (const suffix of ["a", "b"]) {
    const team = await p.create({
      collection: "teams",
      user: admin,
      data: { name: `Compose ${run}-${suffix}` },
    });
    operators.push(
      await p.create({
        collection: "staff",
        user: admin,
        data: {
          name: `Fictional Compose ${suffix}`,
          email: `compose-${run}-${suffix}@example.invalid`,
          password: operatorPassword,
          role: "operations",
          team: team.id,
          active: true,
        },
      }),
    );
  }
  const inquiries = [];
  const common = {
    categories: ["transport"],
    city: "Shanghai",
    people: "2",
    datesUnknown: true,
    name: "Fictional container smoke",
    email: `compose-${run}@example.invalid`,
    language: "English",
    consent: true,
  };
  for (const operator of operators) {
    const receipt = await saveIntake(
      { kind: "request", locale: "en", values: common },
      randomUUID(),
    );
    const inquiry = (
      await p.find({
        collection: "inquiries",
        where: { reference: { equals: receipt.reference } },
        limit: 1,
      })
    ).docs[0];
    inquiries.push(
      await p.update({
        collection: "inquiries",
        id: inquiry.id,
        user: admin,
        data: { team: operator.team, owner: operator.id, notes: "COMPOSE_INTERNAL_NOTE" },
      }),
    );
  }
  const provider = await saveIntake(
    {
      kind: "apply",
      locale: "zh",
      values: {
        ...common,
        organisation: "Fictional provider",
        phone: "00000000000",
        languages: "English",
        capabilities: "Transport test only",
      },
    },
    randomUUID(),
  );
  assert.ok(provider.reference.startsWith("HC-P-"));
  const auth = await p.login({
    collection: "staff",
    data: { email: operators[0].email, password: operatorPassword },
  });
  const staffHeaders = {
    Authorization: "JWT " + auth.token,
    Origin: origin,
    "Content-Type": "application/json",
  };
  for (const path of [
    "/zh",
    "/en",
    "/zh/request",
    "/en/apply",
    "/admin/login",
    "/robots.txt",
    "/sitemap.xml",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  }
  assert.equal((await fetch(base + "/fr")).status, 404);
  const home = await (await fetch(base + "/en")).text();
  assert.ok(!home.includes('href="/en/account"'));
  assert.ok(!home.includes('href="/en/support"'));
  assert.ok(!home.includes('value="fr"'));
  assert.equal(
    (
      await fetch(base + "/api/intake", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    503,
  );
  assert.equal((await fetch(base + "/api/staff/first-register", { method: "POST" })).status, 403);
  assert.equal((await fetch(base + `/api/inquiries/${inquiries[0].id}`)).status, 403);
  assert.equal(
    (await fetch(base + `/api/inquiries/${inquiries[0].id}`, { headers: staffHeaders })).status,
    200,
  );
  const cross = await fetch(base + `/api/inquiries/${inquiries[1].id}`, { headers: staffHeaders });
  assert.ok([403, 404].includes(cross.status));
  const records = await (
    await fetch(base + "/api/inquiries?limit=100", { headers: staffHeaders })
  ).json();
  assert.equal(records.docs.length, 1);
  assert.equal(records.docs[0].id, inquiries[0].id);
  assert.equal((await fetch(base + "/api/reporting")).status, 403);
  assert.equal((await fetch(base + "/api/reporting", { headers: staffHeaders })).status, 200);
  const csv = await fetch(base + "/api/reporting", {
    method: "POST",
    headers: staffHeaders,
    body: JSON.stringify({ entity: "inquiries", filters: {}, includeSensitive: false }),
  });
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("x-export-count"), "1");
  const bytes = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
  const csvText = new TextDecoder().decode(bytes);
  assert.ok(!csvText.includes(inquiries[1].reference));
  assert.ok(!csvText.includes("COMPOSE_INTERNAL_NOTE"));
  assert.equal(
    (
      await fetch(base + "/api/reporting", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ entity: "inquiries", filters: {}, includeSensitive: true }),
      })
    ).status,
    403,
  );
  const audits = await p.find({
    collection: "audit-events",
    where: { and: [{ actor: { equals: operators[0].id } }, { action: { equals: "csv-export" } }] },
    sort: "-createdAt",
    limit: 1,
  });
  assert.equal(audits.totalDocs, 1);
  assert.equal((audits.docs[0].after as { count: number }).count, 1);
  // Exercise the real media upload path with a temporary editor capability on a fictional account.
  const editor = await p.create({
    collection: "staff",
    user: admin,
    data: {
      name: "Fictional Compose editor",
      email: `compose-editor-${run}@example.invalid`,
      password: operatorPassword,
      role: "editor",
      contentKinds: ["page"],
      active: true,
    },
  });
  const editorAuth = await p.login({
    collection: "staff",
    data: { email: editor.email, password: operatorPassword },
  });
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#ff8800" } })
    .png()
    .toBuffer();
  const imageHeaders = {
    Authorization: "JWT " + editorAuth.token,
    Origin: origin,
    "x-image-alt": "Fictional smoke image",
    "x-image-rights": "Generated locally for test",
  };
  const uploaded = await fetch(base + "/api/content-media", {
    method: "POST",
    headers: imageHeaders,
    body: new Uint8Array(image),
  });
  assert.equal(uploaded.status, 200);
  const media = await uploaded.json();
  assert.equal((await fetch(base + `/api/content-media/${media.id}`)).status, 404);
  const privateImage = await fetch(base + `/api/content-media/${media.id}`, {
    headers: imageHeaders,
  });
  assert.equal(privateImage.status, 200);
  assert.match(privateImage.headers.get("content-type") || "", /image\/webp/);
  assert.ok((await privateImage.arrayBuffer()).byteLength > 0);
  await p.update({
    collection: "staff",
    id: operators[0].id,
    user: admin,
    data: { active: false },
  });
  assert.equal((await fetch(base + "/api/inquiries", { headers: staffHeaders })).status, 403);
  console.log(
    "PASS Compose smoke: web/locales/noindex, closed intake and advanced defaults, " +
      "both intake persistence paths, bootstrap protection, anonymous/cross-team/revoked ACLs, " +
      "scoped CSV audit and real private image upload.",
  );
} finally {
  await p.destroy();
}
process.exit(0);
