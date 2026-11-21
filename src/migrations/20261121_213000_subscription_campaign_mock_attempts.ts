import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_subscription_campaign_mock_attempts_state AS ENUM ('attempting','retry','review','failed','completed');
    CREATE TYPE enum_subscription_campaign_mock_attempts_last_outcome AS ENUM ('accepted','temporary','rate-limited','unknown','permanent');
    CREATE TABLE subscription_campaign_mock_attempts (
      id serial PRIMARY KEY, slot_id integer NOT NULL UNIQUE REFERENCES subscription_campaign_mock_slots(id) ON DELETE RESTRICT,
      key varchar NOT NULL UNIQUE, message jsonb NOT NULL, attempted_at jsonb NOT NULL, lease_token_hash varchar NOT NULL,
      state enum_subscription_campaign_mock_attempts_state NOT NULL,
      last_outcome enum_subscription_campaign_mock_attempts_last_outcome, next_attempt_at timestamptz(3),
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX campaign_mock_attempts_created_at_idx ON subscription_campaign_mock_attempts(created_at);
    CREATE INDEX campaign_mock_attempts_updated_at_idx ON subscription_campaign_mock_attempts(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_mock_attempts IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS (SELECT 1 FROM subscription_campaign_mock_attempts)
      THEN RAISE EXCEPTION 'Preserve mock attempts before rollback'; END IF; END $$;
    DROP TABLE subscription_campaign_mock_attempts;
    DROP TYPE enum_subscription_campaign_mock_attempts_state, enum_subscription_campaign_mock_attempts_last_outcome;
  `);
}
