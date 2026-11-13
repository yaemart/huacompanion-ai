import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isActiveStaff } from "@/cms/access";
import WorkflowDesk from "@/components/workflow/WorkflowDesk";
import { inquiryCaseID } from "@/lib/intake-case";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const p = await getPayload({ config });
  const { user } = await p.auth({ headers: await headers() });
  if (user?.collection !== "staff" || !isActiveStaff(user)) redirect("/admin/login");
  return <WorkflowDesk taskID={inquiryCaseID((await searchParams).task)} />;
}
