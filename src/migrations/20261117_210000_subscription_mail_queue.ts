import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE subscription_mail_jobs (
      id serial PRIMARY KEY,
      key varchar NOT NULL,
      subscription_id integer NOT NULL,
      consent_version numeric NOT NULL,
      site_origin varchar NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT subscription_mail_jobs_subscription_id_subscriptions_id_fk
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX subscription_mail_jobs_key_idx ON subscription_mail_jobs(key);
    CREATE INDEX subscription_mail_jobs_subscription_idx ON subscription_mail_jobs(subscription_id);
    CREATE INDEX subscription_mail_jobs_updated_at_idx ON subscription_mail_jobs(updated_at);
    CREATE INDEX subscription_mail_jobs_created_at_idx ON subscription_mail_jobs(created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_mail_jobs IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_mail_jobs) THEN
        RAISE EXCEPTION 'Preserve subscription mail requests before rollback';
      END IF;
    END $$;
    DROP TABLE subscription_mail_jobs;
  `);
}
