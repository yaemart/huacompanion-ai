import { getPayload } from "payload";
import config from "../../payload.config";
import { canManageContent, contentScope } from "../../cms/access";
import { staffFormMessage } from "../../lib/staff-form-feedback";
import { ContentError } from "./service";
export async function contentAuth(headers: Headers) {
  const p = await getPayload({ config });
  const { user } = await p.auth({ headers });
  if (user?.collection !== "staff" || !canManageContent(user) || contentScope(user) === false)
    throw new ContentError("请使用有内容权限的员工账号登录", 403);
  return { p, user: user! };
}
export function checkOrigin(req: Request) {
  if (req.headers.get("origin") !== process.env.APP_URL)
    throw new ContentError("请从华伴网站重新打开刚才的页面，再试一次。", 403);
}
export async function limitedBody(req: Request, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) throw new ContentError("未收到填写内容，请重新打开表单后提交。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ContentError("提交的内容过多，请缩短文字或减少项目后重试。", 413);
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
export async function limitedJSON(req: Request, limit = 150000) {
  const bytes = await limitedBody(req, limit);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ContentError("无法读取填写内容，请先保留当前输入，再重新打开表单。");
  }
}
export function failure(e: unknown) {
  return Response.json(
    {
      error: staffFormMessage(e, "操作未完成，请先保留当前填写，再检查页面后重试。"),
    },
    {
      status: e instanceof ContentError ? e.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
