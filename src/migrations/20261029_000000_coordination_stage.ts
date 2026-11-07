import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
 CREATE TYPE "public"."enum_inquiries_coordination_stage" AS ENUM ('received','contacting','confirming','proposal','completed','closed');
 CREATE TYPE "public"."enum__inquiries_v_version_coordination_stage" AS ENUM ('received','contacting','confirming','proposal','completed','closed');
 ALTER TABLE "inquiries" ADD COLUMN "coordination_stage" "enum_inquiries_coordination_stage";
 ALTER TABLE "_inquiries_v" ADD COLUMN "version_coordination_stage" "enum__inquiries_v_version_coordination_stage";
 `);
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    "Coordination progress may contain operational history. Review data before removing it.",
  );
}
