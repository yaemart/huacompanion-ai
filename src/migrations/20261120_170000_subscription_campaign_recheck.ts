import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE subscription_campaign_jobs ALTER COLUMN status DROP DEFAULT;
    ALTER TYPE enum_subscription_campaign_jobs_status RENAME TO enum_campaign_status_before_recheck;
    CREATE TYPE enum_subscription_campaign_jobs_status AS ENUM ('held','cancelled');
    ALTER TABLE subscription_campaign_jobs ALTER COLUMN status TYPE enum_subscription_campaign_jobs_status
      USING status::text::enum_subscription_campaign_jobs_status;
    ALTER TABLE subscription_campaign_jobs ALTER COLUMN status SET DEFAULT 'held';
    DROP TYPE enum_campaign_status_before_recheck;
    CREATE TYPE enum_subscription_campaign_jobs_cancel_reason AS ENUM ('ineligible','consent-changed','contact-changed');
    ALTER TABLE subscription_campaign_jobs ADD COLUMN cancel_reason enum_subscription_campaign_jobs_cancel_reason,
      ADD COLUMN cancelled_at timestamptz(3);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_jobs IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_jobs
        WHERE status<>'held' OR cancel_reason IS NOT NULL OR cancelled_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Preserve campaign cancellations before rollback';
      END IF;
    END $$;
    ALTER TABLE subscription_campaign_jobs DROP COLUMN cancel_reason, DROP COLUMN cancelled_at;
    DROP TYPE enum_subscription_campaign_jobs_cancel_reason;
    ALTER TABLE subscription_campaign_jobs ALTER COLUMN status DROP DEFAULT;
    ALTER TYPE enum_subscription_campaign_jobs_status RENAME TO enum_campaign_status_with_recheck;
    CREATE TYPE enum_subscription_campaign_jobs_status AS ENUM ('held');
    ALTER TABLE subscription_campaign_jobs ALTER COLUMN status TYPE enum_subscription_campaign_jobs_status
      USING status::text::enum_subscription_campaign_jobs_status;
    ALTER TABLE subscription_campaign_jobs ALTER COLUMN status SET DEFAULT 'held';
    DROP TYPE enum_campaign_status_with_recheck;
  `);
}
