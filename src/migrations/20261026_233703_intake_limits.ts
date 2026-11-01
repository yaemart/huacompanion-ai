import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TABLE "intake_limits" (
    "id" serial PRIMARY KEY NOT NULL,
    "bucket" numeric NOT NULL,
    "count" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "intake_limits_id" integer;
  CREATE UNIQUE INDEX "intake_limits_bucket_idx" ON "intake_limits" USING btree ("bucket");
  CREATE INDEX "intake_limits_updated_at_idx" ON "intake_limits" USING btree ("updated_at");
  CREATE INDEX "intake_limits_created_at_idx" ON "intake_limits" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_intake_limits_fk" FOREIGN KEY ("intake_limits_id") REFERENCES "public"."intake_limits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_intake_limits_id_idx" ON "payload_locked_documents_rels" USING btree ("intake_limits_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "intake_limits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "intake_limits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_intake_limits_fk";

  DROP INDEX "payload_locked_documents_rels_intake_limits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "intake_limits_id";`);
}
