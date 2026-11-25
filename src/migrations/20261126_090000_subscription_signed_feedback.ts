import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Enum replacements keep the migration atomic on PostgreSQL15 (ADD VALUE cannot be used in the same transaction).
  await db.execute(`
    ALTER TYPE enum_subscription_campaign_feedback_kind RENAME TO enum_subscription_campaign_feedback_kind_old;
    CREATE TYPE enum_subscription_campaign_feedback_kind AS ENUM ('delivered','hard-bounce','complaint','provider-suppressed');
    ALTER TABLE subscription_campaign_feedback ALTER COLUMN kind TYPE enum_subscription_campaign_feedback_kind USING kind::text::enum_subscription_campaign_feedback_kind;
    DROP TYPE enum_subscription_campaign_feedback_kind_old;
    ALTER TYPE enum_subscription_marketing_suppressions_reason RENAME TO enum_subscription_marketing_suppressions_reason_old;
    CREATE TYPE enum_subscription_marketing_suppressions_reason AS ENUM ('hard-bounce','complaint','provider-suppressed');
    ALTER TABLE subscription_marketing_suppressions ALTER COLUMN reason TYPE enum_subscription_marketing_suppressions_reason USING reason::text::enum_subscription_marketing_suppressions_reason;
    DROP TYPE enum_subscription_marketing_suppressions_reason_old;
    ALTER TABLE subscription_campaign_feedback ADD COLUMN source_hash varchar,
      ALTER COLUMN attempt_id DROP NOT NULL,
      ADD CONSTRAINT campaign_feedback_address_scope CHECK (attempt_id IS NOT NULL OR (kind='provider-suppressed' AND source_hash IS NOT NULL));
    CREATE TABLE subscription_campaign_mail_bindings (
      id serial PRIMARY KEY, email_id varchar NOT NULL UNIQUE,
      attempt_id integer NOT NULL UNIQUE REFERENCES subscription_campaign_mock_attempts(id) ON DELETE RESTRICT,
      recipient_hash varchar NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(),updated_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX subscription_campaign_mail_bindings_recipient_hash_idx ON subscription_campaign_mail_bindings(recipient_hash);
    CREATE INDEX subscription_campaign_mail_bindings_created_at_idx ON subscription_campaign_mail_bindings(created_at);
    CREATE INDEX subscription_campaign_mail_bindings_updated_at_idx ON subscription_campaign_mail_bindings(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_mail_bindings, subscription_campaign_feedback, subscription_marketing_suppressions IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM subscription_campaign_mail_bindings)
      OR EXISTS(SELECT 1 FROM subscription_campaign_feedback WHERE source_hash IS NOT NULL OR kind='provider-suppressed' OR attempt_id IS NULL)
      OR EXISTS(SELECT 1 FROM subscription_marketing_suppressions WHERE reason='provider-suppressed') THEN RAISE EXCEPTION 'Preserve signed campaign feedback before rollback'; END IF; END $$;
    DROP TABLE subscription_campaign_mail_bindings;
    ALTER TABLE subscription_campaign_feedback DROP CONSTRAINT campaign_feedback_address_scope, DROP COLUMN source_hash, ALTER COLUMN attempt_id SET NOT NULL;
    ALTER TYPE enum_subscription_campaign_feedback_kind RENAME TO enum_subscription_campaign_feedback_kind_new;
    CREATE TYPE enum_subscription_campaign_feedback_kind AS ENUM ('delivered','hard-bounce','complaint');
    ALTER TABLE subscription_campaign_feedback ALTER COLUMN kind TYPE enum_subscription_campaign_feedback_kind USING kind::text::enum_subscription_campaign_feedback_kind;
    DROP TYPE enum_subscription_campaign_feedback_kind_new;
    ALTER TYPE enum_subscription_marketing_suppressions_reason RENAME TO enum_subscription_marketing_suppressions_reason_new;
    CREATE TYPE enum_subscription_marketing_suppressions_reason AS ENUM ('hard-bounce','complaint');
    ALTER TABLE subscription_marketing_suppressions ALTER COLUMN reason TYPE enum_subscription_marketing_suppressions_reason USING reason::text::enum_subscription_marketing_suppressions_reason;
    DROP TYPE enum_subscription_marketing_suppressions_reason_new;
  `);
}
