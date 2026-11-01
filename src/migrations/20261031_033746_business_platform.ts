import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_service_cases_stage" AS ENUM('received', 'discovery', 'quoting', 'awaiting-confirmation', 'accepted', 'scheduled', 'in-service', \
'completed', 'paused', 'cancelled', 'aftercare');
  CREATE TYPE "public"."enum_service_quotes_status" AS ENUM('draft', 'sent', 'accepted', 'superseded', 'withdrawn');
  CREATE TYPE "public"."enum_workflow_events_type" AS ENUM('inquiry-created', 'owner-changed', 'customer-reply', 'quote-sent', 'quote-confirmed', 'quality-due', \
'case-stage', 'task-due', 'task-escalated');
  CREATE TYPE "public"."enum_workflow_tasks_status" AS ENUM('open', 'done');
  CREATE TYPE "public"."enum_workflow_mail_jobs_status" AS ENUM('queued', 'running', 'sent', 'disabled', 'retry', 'uncertain', 'failed');
  CREATE TYPE "public"."enum_content_quality_state" AS ENUM('review-needed', 'checked');
  CREATE TYPE "public"."enum_workflow_settings_enabled_events" AS ENUM('inquiry-created', 'owner-changed', 'customer-reply', 'quote-sent', 'quote-confirmed', \
'quality-due', 'case-stage', 'task-due', 'task-escalated');
  CREATE TABLE "service_cases" (
    "id" serial PRIMARY KEY NOT NULL,
    "inquiry_id" integer NOT NULL,
    "title" varchar NOT NULL,
    "stage" "enum_service_cases_stage" NOT NULL,
    "revision" numeric DEFAULT 1 NOT NULL,
    "latest_quote_id" integer,
    "accepted_quote_id" integer,
    "customer_summary" varchar,
    "public_arrangement" varchar,
    "scheduled_at" timestamp(3) with time zone,
    "provider_id" integer,
    "resource_confirmed" boolean DEFAULT false,
    "internal_arrangement" varchar,
    "completed_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "service_quotes" (
    "id" serial PRIMARY KEY NOT NULL,
    "service_case_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "revision" numeric NOT NULL,
    "status" "enum_service_quotes_status" NOT NULL,
    "title" varchar NOT NULL,
    "scope" varchar NOT NULL,
    "included" varchar NOT NULL,
    "excluded" varchar NOT NULL,
    "terms" varchar NOT NULL,
    "currency" varchar NOT NULL,
    "lines" jsonb NOT NULL,
    "total_minor" numeric NOT NULL,
    "internal_cost_minor" numeric,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "sent_at" timestamp(3) with time zone,
    "confirmed_at" timestamp(3) with time zone,
    "confirmed_by_id" integer,
    "created_by_id" integer NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "service_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "service_case_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "action" varchar NOT NULL,
    "actor_id" integer,
    "customer_id" integer,
    "detail" jsonb,
    "reason" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "workflow_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "type" "enum_workflow_events_type" NOT NULL,
    "inquiry_id" integer,
    "content_draft_id" integer,
    "recipient_id" integer,
    "title" varchar NOT NULL,
    "due_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "workflow_notifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "event_id" integer,
    "inquiry_id" integer,
    "content_draft_id" integer,
    "recipient_id" integer,
    "title" varchar NOT NULL,
    "read_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "workflow_tasks" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "inquiry_id" integer,
    "content_draft_id" integer,
    "assignee_id" integer,
    "title" varchar NOT NULL,
    "status" "enum_workflow_tasks_status" DEFAULT 'open' NOT NULL,
    "due_at" timestamp(3) with time zone,
    "history" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "workflow_mail_jobs" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "notification_id" integer,
    "status" "enum_workflow_mail_jobs_status" DEFAULT 'queued' NOT NULL,
    "lease" varchar,
    "lease_until" timestamp(3) with time zone,
    "next_at" timestamp(3) with time zone,
    "attempts" numeric DEFAULT 0,
    "provider_id" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "content_quality" (
    "id" serial PRIMARY KEY NOT NULL,
    "draft_id" numeric NOT NULL,
    "title" varchar NOT NULL,
    "kind" varchar NOT NULL,
    "content_key" varchar NOT NULL,
    "locale" varchar NOT NULL,
    "owner_id" integer,
    "state" "enum_content_quality_state" DEFAULT 'review-needed' NOT NULL,
    "content_version" varchar NOT NULL,
    "checked_revision" numeric,
    "checked_at" timestamp(3) with time zone,
    "next_review_at" timestamp(3) with time zone,
    "source_version" varchar,
    "source_draft" numeric,
    "source_ids" jsonb,
    "reason" varchar,
    "checked_by" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "content_quality_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "draft_id" numeric NOT NULL,
    "kind" varchar NOT NULL,
    "actor" numeric NOT NULL,
    "revision" numeric NOT NULL,
    "reason" varchar NOT NULL,
    "source_ids" jsonb NOT NULL,
    "next_review_at" timestamp(3) with time zone NOT NULL,
    "source_version" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "customer_accounts" (
    "id" serial PRIMARY KEY NOT NULL,
    "email" varchar NOT NULL,
    "verified_at" timestamp(3) with time zone,
    "active" boolean DEFAULT true,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "customer_challenges" (
    "id" serial PRIMARY KEY NOT NULL,
    "email" varchar NOT NULL,
    "handle" varchar NOT NULL,
    "token_hash" varchar NOT NULL,
    "expires_at" timestamp(3) with time zone,
    "consumed_at" timestamp(3) with time zone,
    "attempts" numeric DEFAULT 0,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "customer_sessions" (
    "id" serial PRIMARY KEY NOT NULL,
    "customer_id" integer NOT NULL,
    "token_hash" varchar NOT NULL,
    "expires_at" timestamp(3) with time zone,
    "revoked_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "customer_inquiry_links" (
    "id" serial PRIMARY KEY NOT NULL,
    "customer_id" integer NOT NULL,
    "inquiry_id" integer NOT NULL,
    "conversation_id" integer,
    "verified_by_id" integer NOT NULL,
    "verification_reason" varchar NOT NULL,
    "verified_at" timestamp(3) with time zone,
    "revoked_by_id" integer,
    "revoked_at" timestamp(3) with time zone,
    "revocation_reason" varchar,
    "active" boolean DEFAULT true,
    "dedupe" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "workflow_settings_enabled_events" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum_workflow_settings_enabled_events",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "workflow_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "email_enabled" boolean DEFAULT false,
    "escalation_enabled" boolean DEFAULT false,
    "escalation_hours" numeric DEFAULT 24,
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "customer_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "enabled" boolean DEFAULT false,
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  ALTER TABLE "content_published" ADD COLUMN "quality_review" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "service_cases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "service_quotes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "service_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workflow_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workflow_notifications_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workflow_tasks_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workflow_mail_jobs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_quality_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_quality_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "customer_accounts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "customer_challenges_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "customer_sessions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "customer_inquiry_links_id" integer;
  ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set \
null ON UPDATE no action;
  ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_latest_quote_id_service_quotes_id_fk" FOREIGN KEY ("latest_quote_id") REFERENCES \
"public"."service_quotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_accepted_quote_id_service_quotes_id_fk" FOREIGN KEY ("accepted_quote_id") REFERENCES \
"public"."service_quotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set \
null ON UPDATE no action;
  ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_service_case_id_service_cases_id_fk" FOREIGN KEY ("service_case_id") REFERENCES \
"public"."service_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_confirmed_by_id_customer_accounts_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES \
"public"."customer_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE set \
null ON UPDATE no action;
  ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_case_id_service_cases_id_fk" FOREIGN KEY ("service_case_id") REFERENCES \
"public"."service_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_events" ADD CONSTRAINT "service_events_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON \
UPDATE no action;
  ALTER TABLE "service_events" ADD CONSTRAINT "service_events_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES \
"public"."customer_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set \
null ON UPDATE no action;
  ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_content_draft_id_content_drafts_id_fk" FOREIGN KEY ("content_draft_id") REFERENCES \
"public"."content_drafts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_recipient_id_staff_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."staff"("id") ON DELETE set \
null ON UPDATE no action;
  ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_event_id_workflow_events_id_fk" FOREIGN KEY ("event_id") REFERENCES \
"public"."workflow_events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") \
ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_content_draft_id_content_drafts_id_fk" FOREIGN KEY ("content_draft_id") REFERENCES \
"public"."content_drafts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_recipient_id_staff_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."staff"("id") ON \
DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set \
null ON UPDATE no action;
  ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_content_draft_id_content_drafts_id_fk" FOREIGN KEY ("content_draft_id") REFERENCES \
"public"."content_drafts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_assignee_id_staff_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."staff"("id") ON DELETE set null ON \
UPDATE no action;
  ALTER TABLE "workflow_mail_jobs" ADD CONSTRAINT "workflow_mail_jobs_notification_id_workflow_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES \
"public"."workflow_notifications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_quality" ADD CONSTRAINT "content_quality_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE set null ON \
UPDATE no action;
  ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES \
"public"."customer_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_inquiry_links" ADD CONSTRAINT "customer_inquiry_links_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES \
"public"."customer_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_inquiry_links" ADD CONSTRAINT "customer_inquiry_links_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") \
ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_inquiry_links" ADD CONSTRAINT "customer_inquiry_links_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES \
"public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_inquiry_links" ADD CONSTRAINT "customer_inquiry_links_verified_by_id_staff_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."staff"("id") \
ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_inquiry_links" ADD CONSTRAINT "customer_inquiry_links_revoked_by_id_staff_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."staff"("id") \
ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_settings_enabled_events" ADD CONSTRAINT "workflow_settings_enabled_events_parent_fk" FOREIGN KEY ("parent_id") REFERENCES \
"public"."workflow_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "service_cases_inquiry_idx" ON "service_cases" USING btree ("inquiry_id");
  CREATE INDEX "service_cases_latest_quote_idx" ON "service_cases" USING btree ("latest_quote_id");
  CREATE INDEX "service_cases_accepted_quote_idx" ON "service_cases" USING btree ("accepted_quote_id");
  CREATE INDEX "service_cases_provider_idx" ON "service_cases" USING btree ("provider_id");
  CREATE INDEX "service_cases_updated_at_idx" ON "service_cases" USING btree ("updated_at");
  CREATE INDEX "service_cases_created_at_idx" ON "service_cases" USING btree ("created_at");
  CREATE INDEX "service_quotes_service_case_idx" ON "service_quotes" USING btree ("service_case_id");
  CREATE UNIQUE INDEX "service_quotes_dedupe_idx" ON "service_quotes" USING btree ("dedupe");
  CREATE INDEX "service_quotes_confirmed_by_idx" ON "service_quotes" USING btree ("confirmed_by_id");
  CREATE INDEX "service_quotes_created_by_idx" ON "service_quotes" USING btree ("created_by_id");
  CREATE INDEX "service_quotes_updated_at_idx" ON "service_quotes" USING btree ("updated_at");
  CREATE INDEX "service_quotes_created_at_idx" ON "service_quotes" USING btree ("created_at");
  CREATE INDEX "service_events_service_case_idx" ON "service_events" USING btree ("service_case_id");
  CREATE UNIQUE INDEX "service_events_dedupe_idx" ON "service_events" USING btree ("dedupe");
  CREATE INDEX "service_events_actor_idx" ON "service_events" USING btree ("actor_id");
  CREATE INDEX "service_events_customer_idx" ON "service_events" USING btree ("customer_id");
  CREATE INDEX "service_events_updated_at_idx" ON "service_events" USING btree ("updated_at");
  CREATE INDEX "service_events_created_at_idx" ON "service_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "workflow_events_key_idx" ON "workflow_events" USING btree ("key");
  CREATE INDEX "workflow_events_inquiry_idx" ON "workflow_events" USING btree ("inquiry_id");
  CREATE INDEX "workflow_events_content_draft_idx" ON "workflow_events" USING btree ("content_draft_id");
  CREATE INDEX "workflow_events_recipient_idx" ON "workflow_events" USING btree ("recipient_id");
  CREATE INDEX "workflow_events_updated_at_idx" ON "workflow_events" USING btree ("updated_at");
  CREATE INDEX "workflow_events_created_at_idx" ON "workflow_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "workflow_notifications_key_idx" ON "workflow_notifications" USING btree ("key");
  CREATE INDEX "workflow_notifications_event_idx" ON "workflow_notifications" USING btree ("event_id");
  CREATE INDEX "workflow_notifications_inquiry_idx" ON "workflow_notifications" USING btree ("inquiry_id");
  CREATE INDEX "workflow_notifications_content_draft_idx" ON "workflow_notifications" USING btree ("content_draft_id");
  CREATE INDEX "workflow_notifications_recipient_idx" ON "workflow_notifications" USING btree ("recipient_id");
  CREATE INDEX "workflow_notifications_updated_at_idx" ON "workflow_notifications" USING btree ("updated_at");
  CREATE INDEX "workflow_notifications_created_at_idx" ON "workflow_notifications" USING btree ("created_at");
  CREATE UNIQUE INDEX "workflow_tasks_key_idx" ON "workflow_tasks" USING btree ("key");
  CREATE INDEX "workflow_tasks_inquiry_idx" ON "workflow_tasks" USING btree ("inquiry_id");
  CREATE INDEX "workflow_tasks_content_draft_idx" ON "workflow_tasks" USING btree ("content_draft_id");
  CREATE INDEX "workflow_tasks_assignee_idx" ON "workflow_tasks" USING btree ("assignee_id");
  CREATE INDEX "workflow_tasks_updated_at_idx" ON "workflow_tasks" USING btree ("updated_at");
  CREATE INDEX "workflow_tasks_created_at_idx" ON "workflow_tasks" USING btree ("created_at");
  CREATE UNIQUE INDEX "workflow_mail_jobs_key_idx" ON "workflow_mail_jobs" USING btree ("key");
  CREATE INDEX "workflow_mail_jobs_notification_idx" ON "workflow_mail_jobs" USING btree ("notification_id");
  CREATE INDEX "workflow_mail_jobs_updated_at_idx" ON "workflow_mail_jobs" USING btree ("updated_at");
  CREATE INDEX "workflow_mail_jobs_created_at_idx" ON "workflow_mail_jobs" USING btree ("created_at");
  CREATE UNIQUE INDEX "content_quality_draft_id_idx" ON "content_quality" USING btree ("draft_id");
  CREATE INDEX "content_quality_owner_idx" ON "content_quality" USING btree ("owner_id");
  CREATE INDEX "content_quality_updated_at_idx" ON "content_quality" USING btree ("updated_at");
  CREATE INDEX "content_quality_created_at_idx" ON "content_quality" USING btree ("created_at");
  CREATE INDEX "content_quality_events_updated_at_idx" ON "content_quality_events" USING btree ("updated_at");
  CREATE INDEX "content_quality_events_created_at_idx" ON "content_quality_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "customer_accounts_email_idx" ON "customer_accounts" USING btree ("email");
  CREATE INDEX "customer_accounts_updated_at_idx" ON "customer_accounts" USING btree ("updated_at");
  CREATE INDEX "customer_accounts_created_at_idx" ON "customer_accounts" USING btree ("created_at");
  CREATE INDEX "customer_challenges_email_idx" ON "customer_challenges" USING btree ("email");
  CREATE UNIQUE INDEX "customer_challenges_handle_idx" ON "customer_challenges" USING btree ("handle");
  CREATE INDEX "customer_challenges_updated_at_idx" ON "customer_challenges" USING btree ("updated_at");
  CREATE INDEX "customer_challenges_created_at_idx" ON "customer_challenges" USING btree ("created_at");
  CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("customer_id");
  CREATE UNIQUE INDEX "customer_sessions_token_hash_idx" ON "customer_sessions" USING btree ("token_hash");
  CREATE INDEX "customer_sessions_updated_at_idx" ON "customer_sessions" USING btree ("updated_at");
  CREATE INDEX "customer_sessions_created_at_idx" ON "customer_sessions" USING btree ("created_at");
  CREATE INDEX "customer_inquiry_links_customer_idx" ON "customer_inquiry_links" USING btree ("customer_id");
  CREATE INDEX "customer_inquiry_links_inquiry_idx" ON "customer_inquiry_links" USING btree ("inquiry_id");
  CREATE INDEX "customer_inquiry_links_conversation_idx" ON "customer_inquiry_links" USING btree ("conversation_id");
  CREATE INDEX "customer_inquiry_links_verified_by_idx" ON "customer_inquiry_links" USING btree ("verified_by_id");
  CREATE INDEX "customer_inquiry_links_revoked_by_idx" ON "customer_inquiry_links" USING btree ("revoked_by_id");
  CREATE UNIQUE INDEX "customer_inquiry_links_dedupe_idx" ON "customer_inquiry_links" USING btree ("dedupe");
  CREATE INDEX "customer_inquiry_links_updated_at_idx" ON "customer_inquiry_links" USING btree ("updated_at");
  CREATE INDEX "customer_inquiry_links_created_at_idx" ON "customer_inquiry_links" USING btree ("created_at");
  CREATE INDEX "workflow_settings_enabled_events_order_idx" ON "workflow_settings_enabled_events" USING btree ("order");
  CREATE INDEX "workflow_settings_enabled_events_parent_idx" ON "workflow_settings_enabled_events" USING btree ("parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_cases_fk" FOREIGN KEY ("service_cases_id") REFERENCES \
"public"."service_cases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_quotes_fk" FOREIGN KEY ("service_quotes_id") REFERENCES \
"public"."service_quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_events_fk" FOREIGN KEY ("service_events_id") REFERENCES \
"public"."service_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workflow_events_fk" FOREIGN KEY ("workflow_events_id") REFERENCES \
"public"."workflow_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workflow_notifications_fk" FOREIGN KEY ("workflow_notifications_id") \
REFERENCES "public"."workflow_notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workflow_tasks_fk" FOREIGN KEY ("workflow_tasks_id") REFERENCES \
"public"."workflow_tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workflow_mail_jobs_fk" FOREIGN KEY ("workflow_mail_jobs_id") REFERENCES \
"public"."workflow_mail_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_quality_fk" FOREIGN KEY ("content_quality_id") REFERENCES \
"public"."content_quality"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_quality_events_fk" FOREIGN KEY ("content_quality_events_id") \
REFERENCES "public"."content_quality_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customer_accounts_fk" FOREIGN KEY ("customer_accounts_id") REFERENCES \
"public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customer_challenges_fk" FOREIGN KEY ("customer_challenges_id") REFERENCES \
"public"."customer_challenges"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customer_sessions_fk" FOREIGN KEY ("customer_sessions_id") REFERENCES \
"public"."customer_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customer_inquiry_links_fk" FOREIGN KEY ("customer_inquiry_links_id") \
REFERENCES "public"."customer_inquiry_links"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_service_cases_id_idx" ON "payload_locked_documents_rels" USING btree ("service_cases_id");
  CREATE INDEX "payload_locked_documents_rels_service_quotes_id_idx" ON "payload_locked_documents_rels" USING btree ("service_quotes_id");
  CREATE INDEX "payload_locked_documents_rels_service_events_id_idx" ON "payload_locked_documents_rels" USING btree ("service_events_id");
  CREATE INDEX "payload_locked_documents_rels_workflow_events_id_idx" ON "payload_locked_documents_rels" USING btree ("workflow_events_id");
  CREATE INDEX "payload_locked_documents_rels_workflow_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("workflow_notifications_id");
  CREATE INDEX "payload_locked_documents_rels_workflow_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("workflow_tasks_id");
  CREATE INDEX "payload_locked_documents_rels_workflow_mail_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("workflow_mail_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_content_quality_id_idx" ON "payload_locked_documents_rels" USING btree ("content_quality_id");
  CREATE INDEX "payload_locked_documents_rels_content_quality_events_id_idx" ON "payload_locked_documents_rels" USING btree ("content_quality_events_id");
  CREATE INDEX "payload_locked_documents_rels_customer_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("customer_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_customer_challenges_id_idx" ON "payload_locked_documents_rels" USING btree ("customer_challenges_id");
  CREATE INDEX "payload_locked_documents_rels_customer_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("customer_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_customer_inquiry_links_id_idx" ON "payload_locked_documents_rels" USING btree ("customer_inquiry_links_id");`);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    "Restore a verified backup; destructive automatic rollback of customer/business records is disabled.",
  );
}
