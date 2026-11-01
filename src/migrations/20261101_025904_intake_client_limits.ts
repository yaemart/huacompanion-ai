import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    DROP INDEX "intake_limits_bucket_idx";
    ALTER TABLE "intake_limits" ADD COLUMN "client_key" varchar DEFAULT 'global' NOT NULL;
    CREATE UNIQUE INDEX "bucket_clientKey_idx" ON "intake_limits" USING btree ("bucket", "client_key");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Only ephemeral per-client quotas are removed. Existing shared/global counts are retained.
  await db.execute(`
    DELETE FROM "intake_limits" WHERE "client_key" <> 'global';
    DROP INDEX "bucket_clientKey_idx";
    CREATE UNIQUE INDEX "intake_limits_bucket_idx" ON "intake_limits" USING btree ("bucket");
    ALTER TABLE "intake_limits" DROP COLUMN "client_key";
  `);
}
