import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    `ALTER TYPE "public"."enum_staff_content_kinds" ADD VALUE IF NOT EXISTS 'venue';`,
  );
  await db.execute(
    `ALTER TYPE "public"."enum_staff_content_kinds" ADD VALUE IF NOT EXISTS 'activity';`,
  );
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error("Preserve staff grants; review rollback manually.");
}
