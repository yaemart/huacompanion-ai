import { supportAuth } from "@/server/support/auth";
import { businessInquiry } from "@/server/business/service";
import { failure } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { inquiryCaseID } from "@/lib/intake-case";
import type { ReplyTemplate } from "@/lib/inquiry-reply-templates";

export async function GET(req: Request) {
  try {
    const { p, user } = await supportAuth(req.headers);
    const id = inquiryCaseID(new URL(req.url).searchParams.get("inquiry"));
    if (!id) throw new ContentError("请先打开已保存的咨询");
    await businessInquiry(p, user, id).catch((error: unknown) => {
      if (error instanceof Error && "status" in error && [403, 404].includes(Number(error.status)))
        throw new ContentError("无权查看此咨询，或咨询不存在", 404);
      throw error;
    });
    const { docs } = await p.find({
      collection: "inquiry-reply-templates",
      where: { enabled: { equals: true } },
      depth: 0,
      pagination: false,
      sort: ["title", "id"],
      select: { title: true, category: true, bodyZh: true, bodyEn: true },
    });
    const templates: ReplyTemplate[] = docs.map(({ id, title, category, bodyZh, bodyEn }) => ({
      id,
      title,
      category,
      bodyZh,
      bodyEn,
    }));
    return Response.json({ templates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
