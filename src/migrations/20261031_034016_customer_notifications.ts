import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TABLE "workflow_customer_notifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "customer_id" integer,
    "inquiry_id" integer,
    "type" varchar NOT NULL,
    "title" varchar NOT NULL,
    "read_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "workflow_mail_jobs" ADD COLUMN "customer_notification_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workflow_customer_notifications_id" integer;
  ALTER TABLE "workflow_customer_notifications" ADD CONSTRAINT "workflow_customer_notifications_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_customer_notifications" ADD CONSTRAINT "workflow_customer_notifications_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "workflow_customer_notifications_key_idx" ON "workflow_customer_notifications" USING btree ("key");
  CREATE INDEX "workflow_customer_notifications_customer_idx" ON "workflow_customer_notifications" USING btree ("customer_id");
  CREATE INDEX "workflow_customer_notifications_inquiry_idx" ON "workflow_customer_notifications" USING btree ("inquiry_id");
  CREATE INDEX "workflow_customer_notifications_updated_at_idx" ON "workflow_customer_notifications" USING btree ("updated_at");
  CREATE INDEX "workflow_customer_notifications_created_at_idx" ON "workflow_customer_notifications" USING btree ("created_at");
  ALTER TABLE "workflow_mail_jobs" ADD CONSTRAINT "workflow_mail_jobs_customer_notification_id_workflow_customer_notifications_id_fk" FOREIGN KEY ("customer_notification_id") REFERENCES "public"."workflow_customer_notifications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workflow_customer_notificat_fk" FOREIGN KEY ("workflow_customer_notifications_id") REFERENCES "public"."workflow_customer_notifications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "workflow_mail_jobs_customer_notification_idx" ON "workflow_mail_jobs" USING btree ("customer_notification_id");
  CREATE INDEX "payload_locked_documents_rels_workflow_customer_notifica_idx" ON "payload_locked_documents_rels" USING btree ("workflow_customer_notifications_id");`);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error("Restore a verified backup; automatic destructive rollback is disabled.");
}
