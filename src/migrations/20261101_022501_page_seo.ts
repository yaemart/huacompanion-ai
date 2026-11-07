import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_seo_settings_pages_path" AS ENUM('home', 'services', 'services/projects', 'providers', 'guides', 'exhibitions',
  'institutions', 'life', 'partners', 'about', 'contact', 'request', 'apply', 'privacy', 'terms');
  CREATE TYPE "public"."enum_seo_settings_pages_locale" AS ENUM('zh', 'en', 'es', 'fr', 'de', 'it', 'ar');
  CREATE TABLE "seo_settings_pages" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "path" "enum_seo_settings_pages_path" NOT NULL,
    "locale" "enum_seo_settings_pages_locale" NOT NULL,
    "seo_title" varchar,
    "seo_description" varchar,
    "seo_image_id" integer
  );

  CREATE TABLE "seo_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  ALTER TABLE "seo_settings_pages" ADD CONSTRAINT "seo_settings_pages_seo_image_id_content_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES
  "public"."content_media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seo_settings_pages" ADD CONSTRAINT "seo_settings_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES
  "public"."seo_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "seo_settings_pages_order_idx" ON "seo_settings_pages" USING btree ("_order");
  CREATE INDEX "seo_settings_pages_parent_id_idx" ON "seo_settings_pages" USING btree ("_parent_id");
  CREATE INDEX "seo_settings_pages_seo_image_idx" ON "seo_settings_pages" USING btree ("seo_image_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   DROP TABLE "seo_settings_pages" CASCADE;
  DROP TABLE "seo_settings" CASCADE;
  DROP TYPE "public"."enum_seo_settings_pages_path";
  DROP TYPE "public"."enum_seo_settings_pages_locale";`);
}
