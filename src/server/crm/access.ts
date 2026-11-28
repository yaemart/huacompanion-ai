import type { Payload, PayloadRequest, Where } from "payload";
import { isAdmin, isManager, isOperator, relationID, type Staff } from "../../cms/access";
import { CrmError } from "../../lib/crm";
export type CrmActor = NonNullable<Staff>;
const sessions = new WeakMap<object, Headers>();
export async function authenticateCrm(p: Payload, headers: Headers): Promise<CrmActor> {
  const copy = new Headers(headers);
  const { user } = await p.auth({ headers: copy });
  if (!user || user.collection !== "staff") throw new CrmError("请先登录员工账号", 401);
  if (!isOperator(user)) throw new CrmError("需要现职业务权限", 403);
  sessions.set(user, copy);
  return user;
}
export const unavailable = () => new CrmError("客户或资料不可用", 404);
export async function currentActor(p: Payload, user: CrmActor, req: Partial<PayloadRequest>) {
  const headers = sessions.get(user);
  if (headers) {
    const fresh = await p.auth({ headers });
    if (
      !fresh.user ||
      fresh.user.collection !== "staff" ||
      String(fresh.user.id) !== String(user.id)
    )
      throw new CrmError("员工登录已失效，请重新登录", 401);
    if (!isOperator(fresh.user)) throw new CrmError("需要现职业务权限", 403);
  }
  if (user.collection !== "staff") throw new CrmError("需要员工身份", 403);
  const actor = (
    await p.find({
      collection: "staff",
      where: { id: { equals: user.id } },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  if (!isOperator(actor)) throw new CrmError("需要现职业务权限", 403);
  return actor;
}
export function clientScope(actor: CrmActor): Where {
  if (isAdmin(actor)) return {};
  const team = relationID(actor.team);
  if (!team) throw unavailable();
  return isManager(actor)
    ? { team: { equals: team } }
    : {
        and: [{ team: { equals: team } }, { owner: { equals: actor.id } }],
      };
}
export async function requireClient(
  p: Payload,
  actor: CrmActor,
  id: number,
  req: Partial<PayloadRequest>,
) {
  const doc = (
    await p.find({
      collection: "crm-clients",
      where: {
        and: [clientScope(actor), { id: { equals: id } }],
      },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  if (!doc) throw unavailable();
  return doc;
}
