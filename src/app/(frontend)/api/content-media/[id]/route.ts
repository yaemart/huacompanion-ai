import { locales } from "@/lib/locales";
import { listPublished } from "@/server/content/service";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPayload } from "payload";
import config from "@/payload.config";
import { canEditContent, type ContentBody } from "@/lib/content-model";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id < 1)
      return new Response(null, { status: 404 });
    const p = await getPayload({ config });
    const { user } = await p.auth({ headers: req.headers });
    let allowed = canEditContent(user);
    if (!allowed) {
      const docs = (await Promise.all(locales.map(locale => listPublished(p, locale)))).flat();
      allowed = docs.some((d) =>
        d.blocks.some((b) => b.type === "image" && b.mediaId === id),
      );
    }
    if (!allowed) return new Response(null, { status: 404 });
    const media = await p.findByID({ collection: "content-media", id });
    if (!/^[a-f0-9-]+\.webp$/.test(media.filename))
      return new Response(null, { status: 404 });
    const file = await readFile(
      path.resolve(".local/content-media", media.filename),
    );
    return new Response(file, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
