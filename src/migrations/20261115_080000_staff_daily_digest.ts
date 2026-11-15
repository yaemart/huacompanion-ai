import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE staff ADD COLUMN daily_digest_enabled boolean DEFAULT false;
    ALTER TABLE workflow_notifications ADD COLUMN digest_at timestamptz(3);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE staff, workflow_notifications IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM staff WHERE daily_digest_enabled)
         OR EXISTS (SELECT 1 FROM workflow_notifications WHERE digest_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Preserve staff digest preferences and scheduled notifications before rollback';
      END IF;
    END $$;
    ALTER TABLE workflow_notifications DROP COLUMN digest_at;
    ALTER TABLE staff DROP COLUMN daily_digest_enabled;
  `);
}
