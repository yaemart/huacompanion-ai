import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`ALTER TABLE "imm_policies" ADD COLUMN "max_stay_hours" numeric;
    ALTER TABLE "_imm_policies_v" ADD COLUMN "version_max_stay_hours" numeric;`);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "imm_policies" WHERE "max_stay_hours" IS NOT NULL)
      OR EXISTS (SELECT 1 FROM "_imm_policies_v" WHERE "version_max_stay_hours" IS NOT NULL)
      OR EXISTS (SELECT 1 FROM "content_published" WHERE "body" #>> '{policy,maxStayHours}' IS NOT NULL) THEN
      RAISE EXCEPTION 'Preserve policy hours before rollback; refusing data loss';
    END IF;
    END $$;
    ALTER TABLE "imm_policies" DROP COLUMN "max_stay_hours";
    ALTER TABLE "_imm_policies_v" DROP COLUMN "version_max_stay_hours";`);
}
