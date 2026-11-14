import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_inquiry_reply_templates_category AS ENUM ('inquiry', 'quote', 'confirmation');
    CREATE TABLE inquiry_reply_templates (
      id serial PRIMARY KEY,
      title varchar NOT NULL,
      category enum_inquiry_reply_templates_category NOT NULL,
      enabled boolean DEFAULT true,
      body_zh varchar NOT NULL,
      body_en varchar NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX inquiry_reply_templates_updated_at_idx ON inquiry_reply_templates (updated_at);
    CREATE INDEX inquiry_reply_templates_created_at_idx ON inquiry_reply_templates (created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE inquiry_reply_templates IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM inquiry_reply_templates) THEN
        RAISE EXCEPTION 'Preserve configured inquiry reply templates before rollback';
      END IF;
    END $$;
    DROP TABLE inquiry_reply_templates;
    DROP TYPE enum_inquiry_reply_templates_category;
  `);
}
