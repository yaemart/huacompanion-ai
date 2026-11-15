import type { Payload } from "payload";
import type { ContentUser } from "../../lib/content-model";
import { relationID } from "../../cms/access";
import { shanghaiToday } from "../../lib/exhibitions";
import { policyTestCountriesAllowed } from "../../lib/immigration-policy-entry";
import { validatePolicyCsv } from "../../lib/policy-csv-import";
import { ContentError, contentTransaction } from "../content/service";
import { mutateSharedPolicyFacts } from "./shared-facts-service";
import { mutateSharedPolicyNote } from "./shared-notes-service";
import { policyActor } from "./workflow";

export async function importPolicyCsv(p: Payload, user: ContentUser, csv: string, save: boolean) {
  return contentTransaction(p, async (tx) => {
    const actor = await policyActor(p, { ...tx }, user, "save");
    let parsed: ReturnType<typeof validatePolicyCsv>;
    try {
      parsed = validatePolicyCsv(
        csv,
        shanghaiToday(),
        actor.id,
        policyTestCountriesAllowed(process.env),
      );
    } catch (error) {
      throw new ContentError(error instanceof Error ? error.message : "无法读取 CSV");
    }
    const { rows, issues, total } = parsed;
    const keys = rows.map((row) => row.key);
    if (keys.length) {
      const where = { in: keys };
      const groups = await p.find({
        collection: "policy-groups",
        where: { contentKey: where },
        depth: 0,
        pagination: false,
        req: { ...tx },
        select: { contentKey: true },
      });
      const notes = await p.find({
        collection: "policy-note-drafts",
        where: { slug: where },
        depth: 0,
        pagination: false,
        req: { ...tx },
        select: { slug: true, locale: true },
      });
      const legacy = await p.find({
        collection: "content-drafts",
        where: { kind: { equals: "immigration-policy" }, contentKey: where },
        depth: 0,
        pagination: false,
        req: { ...tx },
        select: { contentKey: true },
      });
      for (const row of rows) {
        if (
          groups.docs.some((group) => group.contentKey === row.key) ||
          legacy.docs.some((draft) => draft.contentKey === row.key)
        )
          issues.push({ line: row.line, message: "该政策标识已存在，请到政策工作台打开原记录" });
        else if (
          row.notes.some((note) =>
            notes.docs.some((old) => old.slug === row.key && old.locale === note.locale),
          )
        )
          issues.push({ line: row.line, message: "公开说明的网址标识已被同语言记录使用" });
      }
    }
    const created: { line: number; key: string; groupId: number }[] = [];
    const result = { total, issues: issues.sort((a, b) => a.line - b.line), created };
    if (!save || issues.length) return result;
    for (const { line, key, facts, notes } of rows) {
      const draft = await mutateSharedPolicyFacts(
        p,
        actor,
        { action: "save", contentKey: key, facts },
        tx,
      );
      const groupId = relationID(draft.group)!;
      for (const { locale, ...body } of notes)
        await mutateSharedPolicyNote(
          p,
          actor,
          {
            action: "save",
            groupId,
            locale,
            factVersion: null,
            body: { ...body, slug: key },
          },
          tx,
        );
      created.push({ line, key, groupId });
    }
    await p.create({
      collection: "audit-events",
      req: { ...tx },
      data: {
        entity: "policy-group",
        recordId: String(created[0].groupId),
        action: "csv-import",
        actor: actor.id,
        after: { count: created.length, rows: created },
      },
    });
    return result;
  });
}
