import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_subscription_campaign_feedback_kind AS ENUM ('delivered','hard-bounce','complaint');
    CREATE TYPE enum_subscription_marketing_suppressions_reason AS ENUM ('hard-bounce','complaint');
    CREATE TABLE subscription_campaign_feedback (
      id serial PRIMARY KEY, event_id varchar NOT NULL UNIQUE,
      attempt_id integer NOT NULL REFERENCES subscription_campaign_mock_attempts(id) ON DELETE RESTRICT,
      recipient_hash varchar NOT NULL, kind enum_subscription_campaign_feedback_kind NOT NULL,
      occurred_at timestamptz(3) NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX subscription_campaign_feedback_attempt_idx ON subscription_campaign_feedback(attempt_id);
    CREATE INDEX subscription_campaign_feedback_created_at_idx ON subscription_campaign_feedback(created_at);
    CREATE INDEX subscription_campaign_feedback_updated_at_idx ON subscription_campaign_feedback(updated_at);
    CREATE TABLE subscription_marketing_suppressions (
      id serial PRIMARY KEY, recipient_hash varchar NOT NULL UNIQUE,
      reason enum_subscription_marketing_suppressions_reason NOT NULL,
      event_id integer NOT NULL REFERENCES subscription_campaign_feedback(id) ON DELETE RESTRICT,
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX subscription_marketing_suppressions_event_idx ON subscription_marketing_suppressions(event_id);
    CREATE INDEX subscription_marketing_suppressions_created_at_idx ON subscription_marketing_suppressions(created_at);
    CREATE INDEX subscription_marketing_suppressions_updated_at_idx ON subscription_marketing_suppressions(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_feedback, subscription_marketing_suppressions IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS (SELECT 1 FROM subscription_campaign_feedback)
      OR EXISTS (SELECT 1 FROM subscription_marketing_suppressions)
      THEN RAISE EXCEPTION 'Preserve campaign feedback and suppressions before rollback'; END IF; END $$;
    DROP TABLE subscription_marketing_suppressions, subscription_campaign_feedback;
    DROP TYPE enum_subscription_marketing_suppressions_reason, enum_subscription_campaign_feedback_kind;
  `);
}
