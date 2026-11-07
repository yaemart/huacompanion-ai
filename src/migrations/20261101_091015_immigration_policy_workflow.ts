import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TYPE "public"."enum_staff_content_kinds" ADD VALUE 'immigration-policy';`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "staff_content_kinds" WHERE "value"::text = 'immigration-policy') THEN
      RAISE EXCEPTION 'Remove policy board grants explicitly before rollback';
    END IF;
  END $$;
  ALTER TABLE "staff_content_kinds" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_staff_content_kinds";
  CREATE TYPE "public"."enum_staff_content_kinds" AS ENUM('service', 'guide', 'faq', 'page', 'partner', 'provider-profile', 'service-project', 'exhibition', 'institution',
    'venue', 'activity');
  ALTER TABLE "staff_content_kinds" ALTER COLUMN "value" SET DATA TYPE "public"."enum_staff_content_kinds" USING "value"::"public"."enum_staff_content_kinds";`);
}
