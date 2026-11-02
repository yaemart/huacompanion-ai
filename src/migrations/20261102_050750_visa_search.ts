import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TYPE "public"."enum_seo_settings_pages_path" ADD VALUE 'tools/china-visa-free-checker' BEFORE 'home';
  ALTER TABLE "seo_settings" ADD COLUMN "google_site_verification" varchar;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "seo_settings" WHERE coalesce("google_site_verification", '') <> '')
      OR EXISTS (SELECT 1 FROM "seo_settings_pages" WHERE "path"::text = 'tools/china-visa-free-checker') THEN
      RAISE EXCEPTION 'Remove tool SEO settings and verification token explicitly before rollback';
    END IF;
   END $$;
   ALTER TABLE "seo_settings_pages" ALTER COLUMN "path" SET DATA TYPE text;
  DROP TYPE "public"."enum_seo_settings_pages_path";
  CREATE TYPE "public"."enum_seo_settings_pages_path" AS ENUM('home', 'services', 'services/projects', 'providers', 'guides', 'exhibitions',
    'institutions', 'life', 'partners', 'about', 'contact', 'request', 'apply', 'privacy', 'terms');
  ALTER TABLE "seo_settings_pages" ALTER COLUMN "path" SET DATA TYPE "public"."enum_seo_settings_pages_path" USING "path"::"public"."enum_seo_settings_pages_path";
  ALTER TABLE "seo_settings" DROP COLUMN "google_site_verification";`);
}
