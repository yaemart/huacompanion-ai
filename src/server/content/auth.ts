import { getPayload } from "payload";
import config from "../../payload.config";
import { canManageContent, contentScope } from "../../cms/access";
import { ContentError } from "./service";
export async function contentAuth(headers: Headers) {
  const p = await getPayload({ config });
  const { user } = await p.auth({ headers });
  if (user?.collection !== "staff" || (!canManageContent(user) || contentScope(user) === false))
    throw new ContentError("请使用有内容权限的员工账号登录", 403);
  return { p, user: user! };
}
export function checkOrigin(req: Request) {
  if (req.headers.get("origin") !== process.env.APP_URL)
    throw new ContentError("请求来源无效", 403);
}
export async function limitedJSON(req: Request, limit = 150000) {
  const reader = req.body?.getReader();
  if (!reader) throw new ContentError("请求为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ContentError("内容过大", 413);
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ContentError("JSON无效");
  }
}
export function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof ContentError
          ? e.message
          : "操作未完成，请检查内容或刷新后重试",
    },
    {
      status: e instanceof ContentError ? e.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
