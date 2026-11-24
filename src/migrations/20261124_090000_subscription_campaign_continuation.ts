import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE subscription_campaign_jobs
      ADD COLUMN continuation_draft_id integer REFERENCES subscription_campaign_drafts(id) ON DELETE RESTRICT,
      ADD COLUMN continuation_confirmation_id integer REFERENCES subscription_campaign_checks(id) ON DELETE RESTRICT,
      ADD COLUMN continued_at timestamptz(3),
      ADD CONSTRAINT subscription_campaign_jobs_continuation_complete CHECK (
        (continuation_draft_id IS NULL AND continuation_confirmation_id IS NULL AND continued_at IS NULL)
        OR (continuation_draft_id IS NOT NULL AND continuation_confirmation_id IS NOT NULL AND continued_at IS NOT NULL)
      );
    CREATE INDEX subscription_campaign_jobs_continuation_draft_idx ON subscription_campaign_jobs(continuation_draft_id);
    CREATE INDEX subscription_campaign_jobs_continuation_confirmation_idx ON subscription_campaign_jobs(continuation_confirmation_id);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_jobs IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_jobs
        WHERE continuation_draft_id IS NOT NULL OR continuation_confirmation_id IS NOT NULL OR continued_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Preserve campaign continuation bindings before rollback';
      END IF;
    END $$;
    DROP INDEX subscription_campaign_jobs_continuation_confirmation_idx;
    DROP INDEX subscription_campaign_jobs_continuation_draft_idx;
    ALTER TABLE subscription_campaign_jobs
      DROP CONSTRAINT subscription_campaign_jobs_continuation_complete,
      DROP COLUMN continuation_draft_id,
      DROP COLUMN continuation_confirmation_id,
      DROP COLUMN continued_at;
  `);
}
