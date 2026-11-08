import { canAccessContentKind } from "@/cms/access";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { contentAuth } from "@/server/content/auth";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
import { readSharedFactEditor } from "@/server/immigration/shared-editor";
import { PolicyFactWorkbench } from "@/components/content/PolicyFactWorkbench";
export const dynamic = "force-dynamic";
export const metadata = { title: "共用政策事实 · 华伴", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  if (!visaCheckerEnabled()) notFound();
  let auth: Awaited<ReturnType<typeof contentAuth>>;
  try {
    auth = await contentAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  if (!canAccessContentKind(auth.user, "immigration-policy")) notFound();
  const { id } = await searchParams;
  const initial = await readSharedFactEditor(
    auth.p,
    auth.user,
    id === undefined ? undefined : Number(id),
  );
  return <PolicyFactWorkbench key={initial.group?.id || "new"} initial={initial} />;
}
