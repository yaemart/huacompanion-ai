import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import {
  visitorAction,
  visitorRead,
  staffAction,
  staffRead,
} from "../../src/server/support/service";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
let operatorID: number | undefined;
const oldSettings = await p.findGlobal({ slug: "support-settings" });
try {
  await p.updateGlobal({ slug: "support-settings", data: { textChat: true } });
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      sort: "createdAt",
      limit: 1,
    })
  ).docs[0];
  const visitor = randomUUID();
  const key = randomUUID();
  const c = await visitorAction(p, visitor, {
    action: "start",
    key,
    locale: "en",
    topic: "housekeeping",
    aiConsent: false,
  });
  assert.equal((await visitorAction(p, visitor, { action: "start", key, locale: "en" })).id, c.id);
  await assert.rejects(() => visitorRead(p, "different", c.id));
  const mk = randomUUID();
  await visitorAction(p, visitor, { action: "message", id: c.id, key: mk, text: "Need a cleaner" });
  await visitorAction(p, visitor, { action: "message", id: c.id, key: mk, text: "Need a cleaner" });
  assert.equal(
    (await visitorRead(p, visitor, c.id)).messages.filter((m: any) => m.author === "customer")
      .length,
    1,
  );
  let view = await staffRead(p, admin, c.id);
  await staffAction(p, admin, {
    action: "note",
    id: c.id,
    revision: view.conversation.revision,
    key: randomUUID(),
    text: "INTERNAL SECRET",
  });
  assert.ok(!JSON.stringify(await visitorRead(p, visitor, c.id)).includes("INTERNAL SECRET"));
  await assert.rejects(() => staffRead(p, { ...admin, role: "editor", additionalRoles: [] }, c.id));
  await assert.rejects(() =>
    staffRead(p, { ...admin, role: "operations", additionalRoles: [], team: 999999 }, c.id),
  );
  const team = await p.create({
    collection: "teams",
    user: admin,
    data: { name: "Support test " + randomUUID() },
  });
  const operator = await p.create({
    collection: "staff",
    user: admin,
    data: {
      name: "Fictional support operator",
      email: randomUUID() + "@example.invalid",
      password: randomUUID() + randomUUID(),
      role: "operations",
      team: team.id,
      active: true,
    },
  });
  operatorID = operator.id;
  view = await staffRead(p, admin, c.id);
  await staffAction(p, admin, {
    action: "assign",
    id: c.id,
    revision: view.conversation.revision,
    team: team.id,
    owner: operator.id,
  });
  const intake = {
    kind: "request",
    locale: "en",
    values: {
      categories: ["housekeeping"],
      city: "Shanghai",
      name: "Fictional support customer",
      email: "support@example.invalid",
      language: "English",
      consent: true,
      homeService: "regular",
      homeDistrict: "Pudong",
      homeArea: "80",
      homeRooms: "2",
      homeBathrooms: "1",
      homeFlexible: "yes",
      homeFrequency: "once",
      homeEquipment: "confirm",
    },
  };
  const ck = randomUUID();
  const r = await visitorAction(p, visitor, {
    action: "confirm",
    id: c.id,
    key: ck,
    payload: intake,
  });
  assert.equal(
    (await visitorAction(p, visitor, { action: "confirm", id: c.id, key: ck, payload: intake }))
      .reference,
    r.reference,
  );
  assert.equal((await visitorRead(p, visitor, c.id)).inquiries.length, 1);
  assert.equal((await staffRead(p, operator, c.id)).inquiries.length, 1);
  view = await staffRead(p, admin, c.id);
  await staffAction(p, admin, {
    action: "takeover",
    id: c.id,
    revision: view.conversation.revision,
  });
  assert.equal((await visitorRead(p, visitor, c.id)).conversation.mode, "human");
  await assert.rejects(() =>
    staffAction(p, admin, { action: "resolve", id: c.id, revision: view.conversation.revision }),
  );
  console.log(
    "PASS support visitor isolation, note privacy, roles, dedupe, inquiry confirmation and takeover",
  );
} finally {
  await p.updateGlobal({
    slug: "support-settings",
    data: { textChat: oldSettings.textChat === true },
  });
  if (operatorID) {
    const admin = (
      await p.find({
        collection: "staff",
        where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
        sort: "createdAt",
        limit: 1,
      })
    ).docs[0];
    await p.update({ collection: "staff", id: operatorID, user: admin, data: { active: false } });
  }
  await p.destroy();
}
process.exit(0);
