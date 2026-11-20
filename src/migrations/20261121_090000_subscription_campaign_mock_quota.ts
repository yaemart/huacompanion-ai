import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE subscription_campaign_mock_budgets (
      id serial PRIMARY KEY, remaining numeric NOT NULL, base_usage numeric NOT NULL,
      expires_at timestamptz(3) NOT NULL, actor_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      reason varchar NOT NULL, updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE TABLE subscription_campaign_mock_slots (
      id serial PRIMARY KEY, key varchar NOT NULL UNIQUE,
      job_id integer NOT NULL UNIQUE REFERENCES subscription_campaign_jobs(id) ON DELETE RESTRICT,
      batch_id integer NOT NULL REFERENCES subscription_campaign_batches(id) ON DELETE RESTRICT,
      budget_id integer NOT NULL REFERENCES subscription_campaign_mock_budgets(id) ON DELETE RESTRICT,
      recipient_hash varchar(64) NOT NULL, reserved_at timestamptz(3) NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX campaign_mock_slots_batch_idx ON subscription_campaign_mock_slots(batch_id);
    CREATE INDEX campaign_mock_slots_budget_idx ON subscription_campaign_mock_slots(budget_id);
    CREATE INDEX campaign_mock_slots_recipient_hash_idx ON subscription_campaign_mock_slots(recipient_hash);
    CREATE INDEX campaign_mock_slots_reserved_at_idx ON subscription_campaign_mock_slots(reserved_at);
    CREATE INDEX campaign_mock_slots_created_at_idx ON subscription_campaign_mock_slots(created_at);
    CREATE INDEX campaign_mock_slots_updated_at_idx ON subscription_campaign_mock_slots(updated_at);
    CREATE INDEX campaign_mock_budgets_created_at_idx ON subscription_campaign_mock_budgets(created_at);
    CREATE INDEX campaign_mock_budgets_updated_at_idx ON subscription_campaign_mock_budgets(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_mock_slots, subscription_campaign_mock_budgets IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_mock_slots) OR EXISTS (SELECT 1 FROM subscription_campaign_mock_budgets)
      THEN RAISE EXCEPTION 'Preserve mock quota before rollback'; END IF;
    END $$;
    DROP TABLE subscription_campaign_mock_slots;
    DROP TABLE subscription_campaign_mock_budgets;
  `);
}
