import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "support_runs" ADD COLUMN "task" jsonb;`);
}

export async function down(): Promise<void> {
  throw new Error("Support translation rollback requires backup/restore");
}
