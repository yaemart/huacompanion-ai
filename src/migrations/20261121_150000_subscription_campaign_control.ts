import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE subscription_campaign_controls (
      id serial PRIMARY KEY, campaign_key varchar NOT NULL UNIQUE,
      owner_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      paused boolean NOT NULL DEFAULT false, reason varchar NOT NULL, changed_at timestamptz(3) NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX campaign_controls_created_at_idx ON subscription_campaign_controls(created_at);
    CREATE INDEX campaign_controls_updated_at_idx ON subscription_campaign_controls(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_controls IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_controls)
      THEN RAISE EXCEPTION 'Preserve campaign controls before rollback'; END IF;
    END $$;
    DROP TABLE subscription_campaign_controls;
  `);
}
