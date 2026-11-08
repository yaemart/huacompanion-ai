import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`CREATE TABLE "public_company_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_name" varchar,
    "location_zh" varchar,
    "location_en" varchar,
    "email" varchar,
    "phone" varchar,
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  )`);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public_company_settings WHERE
      NULLIF(trim(company_name), '') IS NOT NULL OR NULLIF(trim(location_zh), '') IS NOT NULL OR
      NULLIF(trim(location_en), '') IS NOT NULL OR NULLIF(trim(email), '') IS NOT NULL OR
      NULLIF(trim(phone), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'Preserve configured public company details before rollback';
    END IF;
    END $$;
    DROP TABLE "public_company_settings"`);
}
