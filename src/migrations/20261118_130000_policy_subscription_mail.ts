import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs) {
  await db.execute(`
    ALTER TABLE subscription_mail_jobs
      ADD COLUMN policy_selection jsonb,
      ADD COLUMN deliver_policy boolean NOT NULL DEFAULT false;
    ALTER TABLE subscription_credentials ADD COLUMN policy_request_key varchar;
  `);
}

export async function down({ db }: MigrateDownArgs) {
  await db.execute(`
    LOCK TABLE subscription_mail_jobs, subscription_credentials IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_mail_jobs WHERE policy_selection IS NOT NULL)
        OR EXISTS (SELECT 1 FROM subscription_credentials WHERE policy_request_key IS NOT NULL) THEN
        RAISE EXCEPTION 'Preserve policy mail requests before rollback';
      END IF;
    END $$;
    ALTER TABLE subscription_credentials DROP COLUMN policy_request_key;
    ALTER TABLE subscription_mail_jobs DROP COLUMN policy_selection, DROP COLUMN deliver_policy;
  `);
}
