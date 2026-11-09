import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
const tables = [
  ["inquiries", ""],
  ["providers", ""],
  ["_inquiries_v", "version_"],
  ["_providers_v", "version_"],
] as const;
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [table, prefix] of tables) {
    await db.execute(`ALTER TABLE "${table}" ADD COLUMN "${prefix}follow_ups" jsonb;
      UPDATE "${table}" SET "${prefix}follow_ups" = jsonb_build_array(jsonb_build_object(
        'id','legacy','body',"${prefix}notes",'legacy',true))
      WHERE "${prefix}notes" IS NOT NULL AND "${prefix}notes" <> '';`);
  }
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const [table, prefix] of tables)
    await db.execute(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "${table}" WHERE "${prefix}follow_ups" IS NOT NULL AND
        "${prefix}follow_ups" IS DISTINCT FROM CASE WHEN "${prefix}notes" IS NOT NULL AND "${prefix}notes" <> ''
          THEN jsonb_build_array(jsonb_build_object('id','legacy','body',"${prefix}notes",'legacy',true)) ELSE NULL END)
      THEN RAISE EXCEPTION 'Preserve follow-up history before rollback; refusing data loss'; END IF;
      END $$;`);
  for (const [table, prefix] of tables)
    await db.execute(`ALTER TABLE "${table}" DROP COLUMN "${prefix}follow_ups"`);
}
