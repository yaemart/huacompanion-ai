import type { Payload } from "payload";
import type { ContentUser } from "../../src/lib/content-model.ts";
import type { SharedPolicyFacts } from "../../src/lib/policy-shared-facts.ts";
import { relationID } from "../../src/cms/access.ts";
export function demoPolicyFacts(today: string, verifiedBy: number): SharedPolicyFacts[] {
  const day = (n: number) => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
  return ["XY", "XZ", "XW", "XQ"].map((countryCode, i) => ({
    countryCode,
    countryNameZh: `虚构测试国家${countryCode}（演示）`,
    countryNameEn: `Fictional DEMO country ${countryCode}`,
    policyType: i === 1 ? "transit-240h" : "unilateral",
    maximumStay: i === 1 ? 240 : 30,
    stayUnit: i === 1 ? "hours" : "days",
    validFrom: i === 0 ? "2026-11-01" : day(-90),
    validUntil: i === 0 ? "2026-12-31" : day(i === 2 ? -1 : 90),
    officialSourceUrl: "https://example.invalid/policy",
    lastVerifiedOn: today,
    verifiedBy,
    portsAndRegions: [
      i === 1
        ? "仅虚构演示：须持前往第三国联程机票 / DEMO: onward ticket to a third country required"
        : "仅虚构演示口岸条件 / Fictional eligible port conditions",
    ],
    internalNotes: "DEMO ONLY — not real policy",
  }));
}
/** Creates drafts only; never auto-submits, approves, or overwrites an existing version. */
export async function seedSharedPolicyDemo(p: Payload, editor: ContentUser, today: string) {
  if (process.env.APP_ENV !== "local" || process.env.NODE_ENV === "production")
    throw Error("虚构政策仅允许本地非生产环境");
  if (!editor) throw Error("需要有效的政策编辑账号");
  const { mutateSharedPolicyFacts } =
    await import("../../src/server/immigration/shared-facts-service.ts");
  const { mutateSharedPolicyNote } =
    await import("../../src/server/immigration/shared-notes-service.ts");
  for (const [i, facts] of demoPolicyFacts(today, Number(editor.id)).entries()) {
    const contentKey = `demo-shared-policy-${i + 1}`;
    let group = (
      await p.find({
        collection: "policy-groups",
        where: { contentKey: { equals: contentKey } },
        depth: 0,
      })
    ).docs[0];
    if (!group) {
      const draft = await mutateSharedPolicyFacts(p, editor, { action: "save", contentKey, facts });
      group = await p.findByID({
        collection: "policy-groups",
        id: relationID(draft.group)!,
        depth: 0,
      });
    }
    for (const locale of ["zh", "en"] as const) {
      const existing = await p.count({
        collection: "policy-note-drafts",
        where: { and: [{ group: { equals: group.id } }, { locale: { equals: locale } }] },
      });
      if (existing.totalDocs) continue;
      await mutateSharedPolicyNote(p, editor, {
        action: "save",
        groupId: group.id,
        locale,
        factVersion: relationID(group.activeFactVersion) ?? null,
        body: {
          title: locale === "zh" ? facts.countryNameZh : facts.countryNameEn,
          slug: contentKey,
          publicNotes:
            locale === "zh"
              ? "仅虚构演示，不代表真实政策。请核对共用事实及官方来源。"
              : "Fictional DEMO only. Check the shared facts and official source; this is not real policy.",
        },
      });
    }
  }
}
