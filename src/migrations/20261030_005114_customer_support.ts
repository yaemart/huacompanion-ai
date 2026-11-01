import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_support_conversations_mode" AS ENUM('ai', 'waiting', 'human');
  CREATE TYPE "public"."enum_support_conversations_status" AS ENUM('open', 'waiting-customer', 'resolved');
  CREATE TYPE "public"."enum_support_messages_author" AS ENUM('customer', 'staff', 'ai', 'system');
  CREATE TYPE "public"."enum_support_messages_visibility" AS ENUM('public', 'internal');
  CREATE TYPE "public"."enum_support_runs_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'discarded');
  CREATE TABLE "support_customers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"email" varchar,
  	"verified" boolean DEFAULT false,
  	"locale" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "support_conversations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"visitor_hash" varchar NOT NULL,
  	"start_key" varchar NOT NULL,
  	"locale" varchar NOT NULL,
  	"topic" varchar,
  	"mode" "enum_support_conversations_mode" NOT NULL,
  	"status" "enum_support_conversations_status" DEFAULT 'open' NOT NULL,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"ai_consent" boolean DEFAULT false,
  	"consent_at" timestamp(3) with time zone,
  	"team_id" integer,
  	"owner_id" integer,
  	"customer_id" integer,
  	"summary" varchar,
  	"next_follow_up" timestamp(3) with time zone,
  	"inquiry_links" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "support_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"conversation_id" integer NOT NULL,
  	"dedupe" varchar NOT NULL,
  	"author" "enum_support_messages_author" NOT NULL,
  	"visibility" "enum_support_messages_visibility" NOT NULL,
  	"staff_id" integer,
  	"text" varchar NOT NULL,
  	"citations" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "support_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"conversation_id" integer NOT NULL,
  	"dedupe" varchar NOT NULL,
  	"revision" numeric NOT NULL,
  	"status" "enum_support_runs_status" NOT NULL,
  	"lease" varchar,
  	"lease_until" timestamp(3) with time zone,
  	"day" varchar,
  	"reserved" numeric DEFAULT 0,
  	"usage" jsonb,
  	"model" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_customers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_conversations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_messages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_runs_id" integer;
  ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_customer_id_support_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."support_customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_runs" ADD CONSTRAINT "support_runs_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "support_customers_updated_at_idx" ON "support_customers" USING btree ("updated_at");
  CREATE INDEX "support_customers_created_at_idx" ON "support_customers" USING btree ("created_at");
  CREATE INDEX "support_conversations_visitor_hash_idx" ON "support_conversations" USING btree ("visitor_hash");
  CREATE UNIQUE INDEX "support_conversations_start_key_idx" ON "support_conversations" USING btree ("start_key");
  CREATE INDEX "support_conversations_team_idx" ON "support_conversations" USING btree ("team_id");
  CREATE INDEX "support_conversations_owner_idx" ON "support_conversations" USING btree ("owner_id");
  CREATE INDEX "support_conversations_customer_idx" ON "support_conversations" USING btree ("customer_id");
  CREATE INDEX "support_conversations_updated_at_idx" ON "support_conversations" USING btree ("updated_at");
  CREATE INDEX "support_conversations_created_at_idx" ON "support_conversations" USING btree ("created_at");
  CREATE INDEX "support_messages_conversation_idx" ON "support_messages" USING btree ("conversation_id");
  CREATE UNIQUE INDEX "support_messages_dedupe_idx" ON "support_messages" USING btree ("dedupe");
  CREATE INDEX "support_messages_staff_idx" ON "support_messages" USING btree ("staff_id");
  CREATE INDEX "support_messages_updated_at_idx" ON "support_messages" USING btree ("updated_at");
  CREATE INDEX "support_messages_created_at_idx" ON "support_messages" USING btree ("created_at");
  CREATE INDEX "support_runs_conversation_idx" ON "support_runs" USING btree ("conversation_id");
  CREATE UNIQUE INDEX "support_runs_dedupe_idx" ON "support_runs" USING btree ("dedupe");
  CREATE INDEX "support_runs_status_idx" ON "support_runs" USING btree ("status");
  CREATE INDEX "support_runs_day_idx" ON "support_runs" USING btree ("day");
  CREATE INDEX "support_runs_updated_at_idx" ON "support_runs" USING btree ("updated_at");
  CREATE INDEX "support_runs_created_at_idx" ON "support_runs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_customers_fk" FOREIGN KEY ("support_customers_id") REFERENCES "public"."support_customers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_conversations_fk" FOREIGN KEY ("support_conversations_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_messages_fk" FOREIGN KEY ("support_messages_id") REFERENCES "public"."support_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_runs_fk" FOREIGN KEY ("support_runs_id") REFERENCES "public"."support_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_support_customers_id_idx" ON "payload_locked_documents_rels" USING btree ("support_customers_id");
  CREATE INDEX "payload_locked_documents_rels_support_conversations_id_idx" ON "payload_locked_documents_rels" USING btree ("support_conversations_id");
  CREATE INDEX "payload_locked_documents_rels_support_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("support_messages_id");
  CREATE INDEX "payload_locked_documents_rels_support_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("support_runs_id");`);
}

export async function down(): Promise<void> {
  throw new Error("Support data rollback requires an explicit backup/restore plan");
}
