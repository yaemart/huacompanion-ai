import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute('ALTER TABLE "support_settings" ALTER COLUMN "text_chat" SET DEFAULT false;');
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute('ALTER TABLE "support_settings" ALTER COLUMN "text_chat" SET DEFAULT true;');
}
