import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "inquiries" ADD COLUMN "catalog_source" jsonb;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_catalog_source" jsonb;
  ALTER TABLE "content_drafts" ADD COLUMN "provider_ref" numeric;
  ALTER TABLE "_content_drafts_v" ADD COLUMN "version_provider_ref" numeric;
  ALTER TABLE "content_published" ADD COLUMN "provider_ref" numeric;
  ALTER TABLE "content_published" ADD COLUMN "suspended" boolean DEFAULT false;`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "inquiries" DROP COLUMN "catalog_source";
  ALTER TABLE "_inquiries_v" DROP COLUMN "version_catalog_source";
  ALTER TABLE "content_drafts" DROP COLUMN "provider_ref";
  ALTER TABLE "_content_drafts_v" DROP COLUMN "version_provider_ref";
  ALTER TABLE "content_published" DROP COLUMN "provider_ref";
  ALTER TABLE "content_published" DROP COLUMN "suspended";`);
}
