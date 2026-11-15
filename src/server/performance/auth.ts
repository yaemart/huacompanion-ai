import { getPayload } from "payload";
import config from "../../payload.config";
import { isActiveStaff } from "../../cms/access";
import { ContentError } from "../content/error";

export async function performanceAuth(headers: Headers) {
  const p = await getPayload({ config });
  const { user } = await p.auth({ headers });
  if (user?.collection !== "staff" || !isActiveStaff(user))
    throw new ContentError("请使用员工账号登录。", 403);
  return { p, user };
}
