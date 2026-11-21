import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

async function reasonType(db: MigrateUpArgs["db"], cancelling: boolean) {
  await db.execute(`
    ALTER TYPE enum_subscription_campaign_jobs_cancel_reason RENAME TO enum_campaign_reason_old;
    CREATE TYPE enum_subscription_campaign_jobs_cancel_reason AS ENUM
      ('ineligible','consent-changed','contact-changed'${cancelling ? ",'campaign-cancelled'" : ""});
    ALTER TABLE subscription_campaign_jobs ALTER COLUMN cancel_reason TYPE enum_subscription_campaign_jobs_cancel_reason
      USING cancel_reason::text::enum_subscription_campaign_jobs_cancel_reason;
    DROP TYPE enum_campaign_reason_old;
  `);
}
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`ALTER TABLE subscription_campaign_controls
    ADD COLUMN cancelled_at timestamptz(3), ADD COLUMN cancel_reason varchar;`);
  await reasonType(db, true);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_controls, subscription_campaign_jobs IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_controls WHERE cancelled_at IS NOT NULL OR cancel_reason IS NOT NULL)
        OR EXISTS (SELECT 1 FROM subscription_campaign_jobs WHERE cancel_reason='campaign-cancelled')
      THEN RAISE EXCEPTION 'Preserve campaign cancellations before rollback'; END IF;
    END $$;
    ALTER TABLE subscription_campaign_controls DROP COLUMN cancelled_at, DROP COLUMN cancel_reason;
  `);
  await reasonType(db, false);
}
