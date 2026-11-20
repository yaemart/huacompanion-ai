import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_subscription_campaign_jobs_locale AS ENUM ('zh','en');
    CREATE TYPE enum_subscription_campaign_jobs_status AS ENUM ('held');
    CREATE TABLE subscription_campaign_batches (
      id serial PRIMARY KEY,
      campaign_key varchar NOT NULL UNIQUE,
      draft_id integer NOT NULL REFERENCES subscription_campaign_drafts(id) ON DELETE RESTRICT,
      confirmation_id integer NOT NULL REFERENCES subscription_campaign_checks(id) ON DELETE RESTRICT,
      frozen_at timestamptz(3) NOT NULL,
      counts jsonb NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX subscription_campaign_batches_draft_idx ON subscription_campaign_batches(draft_id);
    CREATE INDEX subscription_campaign_batches_updated_at_idx ON subscription_campaign_batches(updated_at);
    CREATE INDEX subscription_campaign_batches_created_at_idx ON subscription_campaign_batches(created_at);
    CREATE TABLE subscription_campaign_jobs (
      id serial PRIMARY KEY,
      campaign_key varchar NOT NULL,
      batch_id integer NOT NULL REFERENCES subscription_campaign_batches(id) ON DELETE RESTRICT,
      subscription_id integer NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
      consent_version numeric NOT NULL,
      locale enum_subscription_campaign_jobs_locale NOT NULL,
      recipient_hash varchar(64) NOT NULL,
      status enum_subscription_campaign_jobs_status NOT NULL DEFAULT 'held',
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX subscription_campaign_jobs_campaign_key_recipient_hash_idx ON subscription_campaign_jobs(campaign_key,recipient_hash);
    CREATE INDEX subscription_campaign_jobs_batch_idx ON subscription_campaign_jobs(batch_id);
    CREATE INDEX subscription_campaign_jobs_subscription_idx ON subscription_campaign_jobs(subscription_id);
    CREATE INDEX subscription_campaign_jobs_updated_at_idx ON subscription_campaign_jobs(updated_at);
    CREATE INDEX subscription_campaign_jobs_created_at_idx ON subscription_campaign_jobs(created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_batches, subscription_campaign_jobs IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_batches) OR EXISTS (SELECT 1 FROM subscription_campaign_jobs) THEN
        RAISE EXCEPTION 'Preserve campaign snapshots before rollback';
      END IF;
    END $$;
    DROP TABLE subscription_campaign_jobs;
    DROP TABLE subscription_campaign_batches;
    DROP TYPE enum_subscription_campaign_jobs_status;
    DROP TYPE enum_subscription_campaign_jobs_locale;
  `);
}
