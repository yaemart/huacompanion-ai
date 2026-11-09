import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`ALTER TABLE "workflow_settings" ADD COLUMN "inquiry_reply_zh" varchar;
    ALTER TABLE "workflow_settings" ADD COLUMN "inquiry_reply_en" varchar;`);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM workflow_settings WHERE
      NULLIF(trim(inquiry_reply_zh), '') IS NOT NULL OR
      NULLIF(trim(inquiry_reply_en), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'Preserve inquiry reply text before rollback; refusing data loss';
    END IF;
    END $$;
    ALTER TABLE "workflow_settings" DROP COLUMN "inquiry_reply_zh";
    ALTER TABLE "workflow_settings" DROP COLUMN "inquiry_reply_en";`);
}
