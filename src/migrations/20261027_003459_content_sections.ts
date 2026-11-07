import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "content_drafts" ADD COLUMN "section_label" varchar;
  ALTER TABLE "_content_drafts_v" ADD COLUMN "version_section_label" varchar;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "content_drafts" DROP COLUMN "section_label";
  ALTER TABLE "_content_drafts_v" DROP COLUMN "version_section_label";`);
}
