import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`CREATE TYPE "enum_quote_template_settings_templates_category" AS ENUM (
    'housekeeping','medical','business','transport','stays','travel','interpretation','arrival'
  );
  CREATE TABLE "quote_template_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );
  CREATE TABLE "quote_template_settings_templates" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL REFERENCES "quote_template_settings"("id") ON DELETE CASCADE,
    "id" varchar PRIMARY KEY NOT NULL,
    "category" "enum_quote_template_settings_templates_category" NOT NULL,
    "enabled" boolean DEFAULT true,
    "included" varchar NOT NULL,
    "excluded" varchar NOT NULL,
    "terms" varchar NOT NULL
  );
  CREATE INDEX "quote_template_settings_templates_order_idx" ON "quote_template_settings_templates" ("_order");
  CREATE INDEX "quote_template_settings_templates_parent_id_idx" ON "quote_template_settings_templates" ("_parent_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`LOCK TABLE "quote_template_settings", "quote_template_settings_templates" IN ACCESS EXCLUSIVE MODE;
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "quote_template_settings_templates") THEN
      RAISE EXCEPTION 'Preserve configured quote templates before rollback';
    END IF;
  END $$;
  DROP TABLE "quote_template_settings_templates";
  DROP TABLE "quote_template_settings";
  DROP TYPE "enum_quote_template_settings_templates_category";`);
}
