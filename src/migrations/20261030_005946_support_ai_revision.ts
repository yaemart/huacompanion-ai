import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "support_conversations" ADD COLUMN "ai_revision" numeric DEFAULT 1 NOT NULL;`);
}

export async function down(): Promise<void> {
  throw new Error("Support revision rollback requires backup/restore");
}
