import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE exhibition_reminder_jobs (
      id serial PRIMARY KEY,
      key varchar(64) NOT NULL UNIQUE,
      scope varchar(115) NOT NULL,
      subscription_id integer NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
      body jsonb NOT NULL CHECK (COALESCE(body->>'status','') IN ('local-held','local-cancelled')),
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX exhibition_reminder_jobs_scope_idx ON exhibition_reminder_jobs(scope);
    CREATE INDEX exhibition_reminder_jobs_subscription_idx ON exhibition_reminder_jobs(subscription_id);
    CREATE INDEX exhibition_reminder_jobs_created_at_idx ON exhibition_reminder_jobs(created_at);
    CREATE INDEX exhibition_reminder_jobs_updated_at_idx ON exhibition_reminder_jobs(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE exhibition_reminder_jobs IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS (SELECT 1 FROM exhibition_reminder_jobs)
      THEN RAISE EXCEPTION 'Preserve exhibition reminder history before rollback'; END IF; END $$;
    DROP TABLE exhibition_reminder_jobs;
  `);
}
