import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "support_conversations" ADD COLUMN "proposed_request" jsonb;`);
}

export async function down(): Promise<void> {
  throw new Error("Support draft rollback requires backup/restore");
}
