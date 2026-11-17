import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs) {
  await db.execute(`
    CREATE TYPE enum_subscription_mail_jobs_status AS ENUM
      ('queued', 'running', 'retry', 'uncertain', 'sent', 'failed', 'cancelled');
    ALTER TABLE subscription_mail_jobs
      ADD COLUMN status enum_subscription_mail_jobs_status NOT NULL DEFAULT 'queued',
      ADD COLUMN attempted_at jsonb,
      ADD COLUMN lease varchar,
      ADD COLUMN message_hash varchar,
      ADD COLUMN next_at timestamptz(3);
  `);
}

export async function down({ db }: MigrateDownArgs) {
  await db.execute(`
    LOCK TABLE subscription_mail_jobs IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_mail_jobs WHERE status <> 'queued' OR attempted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Preserve subscription delivery history before rollback';
      END IF;
    END $$;
    ALTER TABLE subscription_mail_jobs
      DROP COLUMN status, DROP COLUMN attempted_at, DROP COLUMN lease, DROP COLUMN message_hash, DROP COLUMN next_at;
    DROP TYPE enum_subscription_mail_jobs_status;
  `);
}
