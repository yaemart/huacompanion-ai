import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_business_ai_tasks_status" AS ENUM('unconfigured', 'queued', 'running', 'succeeded', 'adopted', 'failed', 'discarded', 'cancelled');
  CREATE TYPE "public"."enum_service_quotes_review_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TABLE "business_ai_tasks" (
    "id" serial PRIMARY KEY NOT NULL,
    "service_case_id" integer NOT NULL,
    "created_by_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "fingerprint" varchar NOT NULL,
    "status" "enum_business_ai_tasks_status" NOT NULL,
    "input" jsonb NOT NULL,
    "result" jsonb,
    "error" varchar,
    "model" varchar,
    "lease" varchar,
    "lease_until" timestamp(3) with time zone,
    "day" varchar,
    "reserved" numeric DEFAULT 0,
    "usage" jsonb,
    "adopted_quote_id" integer,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "service_quotes" ADD COLUMN "ai_task_id" integer;
  ALTER TABLE "service_quotes" ADD COLUMN "review_status" "enum_service_quotes_review_status";
  ALTER TABLE "service_quotes" ADD COLUMN "reviewed_by_id" integer;
  ALTER TABLE "service_quotes" ADD COLUMN "reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "service_quotes" ADD COLUMN "review_reason" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "business_ai_tasks_id" integer;
  ALTER TABLE "business_ai_tasks" ADD CONSTRAINT "business_ai_tasks_service_case_id_service_cases_id_fk" FOREIGN KEY ("service_case_id") REFERENCES "public"."service_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "business_ai_tasks" ADD CONSTRAINT "business_ai_tasks_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "business_ai_tasks" ADD CONSTRAINT "business_ai_tasks_adopted_quote_id_service_quotes_id_fk" FOREIGN KEY ("adopted_quote_id") REFERENCES "public"."service_quotes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "business_ai_tasks_service_case_idx" ON "business_ai_tasks" USING btree ("service_case_id");
  CREATE INDEX "business_ai_tasks_created_by_idx" ON "business_ai_tasks" USING btree ("created_by_id");
  CREATE UNIQUE INDEX "business_ai_tasks_dedupe_idx" ON "business_ai_tasks" USING btree ("dedupe");
  CREATE INDEX "business_ai_tasks_adopted_quote_idx" ON "business_ai_tasks" USING btree ("adopted_quote_id");
  CREATE INDEX "business_ai_tasks_updated_at_idx" ON "business_ai_tasks" USING btree ("updated_at");
  CREATE INDEX "business_ai_tasks_created_at_idx" ON "business_ai_tasks" USING btree ("created_at");
  ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_ai_task_id_business_ai_tasks_id_fk" FOREIGN KEY ("ai_task_id") REFERENCES "public"."business_ai_tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_reviewed_by_id_staff_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_business_ai_tasks_fk" FOREIGN KEY ("business_ai_tasks_id") REFERENCES "public"."business_ai_tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "service_quotes_ai_task_idx" ON "service_quotes" USING btree ("ai_task_id");
  CREATE INDEX "service_quotes_reviewed_by_idx" ON "service_quotes" USING btree ("reviewed_by_id");
  CREATE INDEX "payload_locked_documents_rels_business_ai_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("business_ai_tasks_id");`);
}

export async function down(): Promise<void> {
  throw new Error(
    "Restore a verified matching database backup instead of deleting business AI audit data.",
  );
}
