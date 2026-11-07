import { canReviewContent, isAdmin, contentKinds } from "@/cms/access";
import { canEditContent } from "@/lib/content-model";
import { locales } from "@/lib/locales";
import { contentAuth, checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { listPublished, mutateContent } from "@/server/content/service";
export async function GET(req: Request) {
  try {
    const { p, user } = await contentAuth(req.headers);
    const id = new URL(req.url).searchParams.get("versions");
    if (id) {
      await p.findByID({
        collection: "content-drafts",
        id: Number(id),
        overrideAccess: false,
        user,
        depth: 0,
      });
      const r = await p.findVersions({
        collection: "content-drafts",
        where: { parent: { equals: Number(id) } },
        limit: 30,
        sort: "-updatedAt",
        overrideAccess: false,
        user,
      });
      return Response.json(
        {
          versions: r.docs.map((v) => ({
            id: v.id,
            revision: v.version.revision,
            updatedAt: v.updatedAt,
          })),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const [drafts, published, media, tasks] = await Promise.all([
      p.find({
        collection: "content-drafts",
        limit: 1000,
        sort: "-updatedAt",
        overrideAccess: false,
        user,
      }),
      p.find({ collection: "content-published", limit: 1000 }),
      p.find({
        collection: "content-media",
        limit: 1000,
        overrideAccess: false,
        user,
      }),
      p.find({
        collection: "content-agent-tasks",
        limit: 100,
        sort: "-updatedAt",
        overrideAccess: false,
        user,
      }),
    ]);
    const providers = isAdmin(user)
      ? (
          await p.find({
            collection: "providers",
            limit: 1000,
            depth: 0,
            overrideAccess: false,
            user,
          })
        ).docs.map((d) => ({
          id: d.id,
          name: d.organisation,
          status: d.status,
          publicApproved: d.publicApproved,
        }))
      : [];
    const visible = (await Promise.all(locales.map((locale) => listPublished(p, locale)))).flat();
    return Response.json(
      {
        role: user.role,
        permissions: {
          canEdit: canEditContent(user),
          canReview: canReviewContent(user),
          isAdmin: isAdmin(user),
          contentKinds: isAdmin(user) ? [...contentKinds] : user.contentKinds || [],
          userId: user.id,
        },
        providers,
        drafts: drafts.docs,
        published: published.docs
          .filter((d) => drafts.docs.some((draft) => draft.id === d.draftId))
          .map((d) => {
            const body = d.body as any;
            const live = visible.find(
              (v) =>
                v.contentKey === body.contentKey &&
                v.kind === body.kind &&
                v.locale === body.locale,
            );
            return {
              draftId: d.draftId,
              active: d.active,
              revision: d.revision,
              visible: !!live,
              acceptingInquiries: live?.acceptingInquiries,
              suspended: d.suspended,
            };
          }),
        media: media.docs,
        tasks: tasks.docs,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await contentAuth(req.headers);
    const input = await limitedJSON(req);
    return Response.json(await mutateContent(p, user, input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
