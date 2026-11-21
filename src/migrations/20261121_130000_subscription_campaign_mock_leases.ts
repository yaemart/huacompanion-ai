import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE subscription_campaign_mock_leases (
      id serial PRIMARY KEY, slot_id integer NOT NULL UNIQUE REFERENCES subscription_campaign_mock_slots(id) ON DELETE RESTRICT,
      token varchar NOT NULL, expires_at timestamptz(3) NOT NULL, completed_at timestamptz(3),
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX campaign_mock_leases_created_at_idx ON subscription_campaign_mock_leases(created_at);
    CREATE INDEX campaign_mock_leases_updated_at_idx ON subscription_campaign_mock_leases(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_mock_leases IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_mock_leases)
      THEN RAISE EXCEPTION 'Preserve mock leases before rollback'; END IF;
    END $$;
    DROP TABLE subscription_campaign_mock_leases;
  `);
}
