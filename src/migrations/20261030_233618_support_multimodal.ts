import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_support_voice_jobs_kind" AS ENUM('transcribe', 'synthesize');
  CREATE TYPE "public"."enum_support_voice_jobs_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'discarded');
  CREATE TYPE "public"."enum_support_calls_kind" AS ENUM('ai', 'human');
  CREATE TYPE "public"."enum_support_calls_state" AS ENUM('queued', 'connecting', 'active', 'ended', 'expired', 'failed');
  CREATE TYPE "public"."enum_support_call_presence_state" AS ENUM('available', 'busy', 'away', 'offline');
  CREATE TYPE "public"."enum_support_reviews_category" AS ENUM('knowledge-gap', 'quality', 'follow-up');
  CREATE TYPE "public"."enum_support_retention_audits_kind" AS ENUM('text', 'audio', 'transcript');
  CREATE TYPE "public"."enum_support_retention_audits_status" AS ENUM('preview', 'executed');
  CREATE TABLE "support_voice_audio" (
    "id" serial PRIMARY KEY NOT NULL,
    "conversation_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "digest" varchar NOT NULL,
    "body" varchar NOT NULL,
    "seconds" numeric NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "support_voice_jobs" (
    "id" serial PRIMARY KEY NOT NULL,
    "conversation_id" integer NOT NULL,
    "message_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "kind" "enum_support_voice_jobs_kind" NOT NULL,
    "status" "enum_support_voice_jobs_status" NOT NULL,
    "lease" varchar,
    "lease_until" timestamp(3) with time zone,
    "consent_at" timestamp(3) with time zone NOT NULL,
    "day" varchar,
    "reserved" numeric DEFAULT 0,
    "error" varchar,
    "audio_id" integer,
    "actor_id" integer,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "support_calls" (
    "id" serial PRIMARY KEY NOT NULL,
    "conversation_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "gateway_i_d" varchar NOT NULL,
    "kind" "enum_support_calls_kind" NOT NULL,
    "state" "enum_support_calls_state" NOT NULL,
    "owner_id" integer,
    "staff_joined" boolean DEFAULT false,
    "claim_until" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "day" varchar,
    "reserved_seconds" numeric NOT NULL,
    "reserved_cents" numeric NOT NULL,
    "ai_bridge" boolean DEFAULT false,
    "cleanup_pending" boolean DEFAULT false,
    "rejected_staff" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "support_call_presence" (
    "id" serial PRIMARY KEY NOT NULL,
    "staff_key" varchar NOT NULL,
    "staff_id" integer NOT NULL,
    "state" "enum_support_call_presence_state" NOT NULL,
    "heartbeat_at" timestamp(3) with time zone NOT NULL,
    "languages" jsonb NOT NULL,
    "capacity" numeric NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "support_feedback" (
    "id" serial PRIMARY KEY NOT NULL,
    "conversation_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "rating" numeric NOT NULL,
    "comment" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "support_reviews" (
    "id" serial PRIMARY KEY NOT NULL,
    "conversation_id" integer NOT NULL,
    "dedupe" varchar NOT NULL,
    "actor_id" integer NOT NULL,
    "category" "enum_support_reviews_category" NOT NULL,
    "note" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "support_retention_audits" (
    "id" serial PRIMARY KEY NOT NULL,
    "actor_id" integer NOT NULL,
    "kind" "enum_support_retention_audits_kind" NOT NULL,
    "token" varchar NOT NULL,
    "status" "enum_support_retention_audits_status" NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "candidates" jsonb NOT NULL,
    "policy" jsonb NOT NULL,
    "executed_at" timestamp(3) with time zone,
    "result" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "support_messages" ADD COLUMN "voice_audio_id" integer;
  ALTER TABLE "support_messages" ADD COLUMN "voice_transcript" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_voice_audio_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_voice_jobs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_calls_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_call_presence_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_feedback_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_reviews_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "support_retention_audits_id" integer;
  ALTER TABLE "support_settings" ADD COLUMN "retention_deletion_enabled" boolean DEFAULT false;
  ALTER TABLE "support_settings" ADD COLUMN "text_retention_days" numeric DEFAULT 365 NOT NULL;
  ALTER TABLE "support_settings" ADD COLUMN "audio_retention_days" numeric DEFAULT 30 NOT NULL;
  ALTER TABLE "support_settings" ADD COLUMN "transcript_retention_days" numeric DEFAULT 365 NOT NULL;
  ALTER TABLE "support_settings" ADD COLUMN "voice_max_seconds" numeric DEFAULT 60;
  ALTER TABLE "support_settings" ADD COLUMN "voice_max_bytes" numeric DEFAULT 6000000;
  ALTER TABLE "support_settings" ADD COLUMN "voice_uploads_per_minute" numeric DEFAULT 4;
  ALTER TABLE "support_voice_audio" ADD CONSTRAINT "support_voice_audio_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_voice_jobs" ADD CONSTRAINT "support_voice_jobs_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_voice_jobs" ADD CONSTRAINT "support_voice_jobs_message_id_support_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_voice_jobs" ADD CONSTRAINT "support_voice_jobs_audio_id_support_voice_audio_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."support_voice_audio"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_voice_jobs" ADD CONSTRAINT "support_voice_jobs_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_calls" ADD CONSTRAINT "support_calls_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_calls" ADD CONSTRAINT "support_calls_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_call_presence" ADD CONSTRAINT "support_call_presence_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_feedback" ADD CONSTRAINT "support_feedback_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_reviews" ADD CONSTRAINT "support_reviews_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_reviews" ADD CONSTRAINT "support_reviews_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "support_retention_audits" ADD CONSTRAINT "support_retention_audits_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "support_voice_audio_conversation_idx" ON "support_voice_audio" USING btree ("conversation_id");
  CREATE UNIQUE INDEX "support_voice_audio_dedupe_idx" ON "support_voice_audio" USING btree ("dedupe");
  CREATE INDEX "support_voice_audio_updated_at_idx" ON "support_voice_audio" USING btree ("updated_at");
  CREATE INDEX "support_voice_audio_created_at_idx" ON "support_voice_audio" USING btree ("created_at");
  CREATE INDEX "support_voice_jobs_conversation_idx" ON "support_voice_jobs" USING btree ("conversation_id");
  CREATE INDEX "support_voice_jobs_message_idx" ON "support_voice_jobs" USING btree ("message_id");
  CREATE UNIQUE INDEX "support_voice_jobs_dedupe_idx" ON "support_voice_jobs" USING btree ("dedupe");
  CREATE INDEX "support_voice_jobs_status_idx" ON "support_voice_jobs" USING btree ("status");
  CREATE INDEX "support_voice_jobs_day_idx" ON "support_voice_jobs" USING btree ("day");
  CREATE INDEX "support_voice_jobs_audio_idx" ON "support_voice_jobs" USING btree ("audio_id");
  CREATE INDEX "support_voice_jobs_actor_idx" ON "support_voice_jobs" USING btree ("actor_id");
  CREATE INDEX "support_voice_jobs_updated_at_idx" ON "support_voice_jobs" USING btree ("updated_at");
  CREATE INDEX "support_voice_jobs_created_at_idx" ON "support_voice_jobs" USING btree ("created_at");
  CREATE INDEX "support_calls_conversation_idx" ON "support_calls" USING btree ("conversation_id");
  CREATE UNIQUE INDEX "support_calls_dedupe_idx" ON "support_calls" USING btree ("dedupe");
  CREATE UNIQUE INDEX "support_calls_gateway_i_d_idx" ON "support_calls" USING btree ("gateway_i_d");
  CREATE INDEX "support_calls_state_idx" ON "support_calls" USING btree ("state");
  CREATE INDEX "support_calls_owner_idx" ON "support_calls" USING btree ("owner_id");
  CREATE INDEX "support_calls_expires_at_idx" ON "support_calls" USING btree ("expires_at");
  CREATE INDEX "support_calls_day_idx" ON "support_calls" USING btree ("day");
  CREATE INDEX "support_calls_updated_at_idx" ON "support_calls" USING btree ("updated_at");
  CREATE INDEX "support_calls_created_at_idx" ON "support_calls" USING btree ("created_at");
  CREATE UNIQUE INDEX "support_call_presence_staff_key_idx" ON "support_call_presence" USING btree ("staff_key");
  CREATE INDEX "support_call_presence_staff_idx" ON "support_call_presence" USING btree ("staff_id");
  CREATE INDEX "support_call_presence_updated_at_idx" ON "support_call_presence" USING btree ("updated_at");
  CREATE INDEX "support_call_presence_created_at_idx" ON "support_call_presence" USING btree ("created_at");
  CREATE INDEX "support_feedback_conversation_idx" ON "support_feedback" USING btree ("conversation_id");
  CREATE UNIQUE INDEX "support_feedback_dedupe_idx" ON "support_feedback" USING btree ("dedupe");
  CREATE INDEX "support_feedback_updated_at_idx" ON "support_feedback" USING btree ("updated_at");
  CREATE INDEX "support_feedback_created_at_idx" ON "support_feedback" USING btree ("created_at");
  CREATE INDEX "support_reviews_conversation_idx" ON "support_reviews" USING btree ("conversation_id");
  CREATE UNIQUE INDEX "support_reviews_dedupe_idx" ON "support_reviews" USING btree ("dedupe");
  CREATE INDEX "support_reviews_actor_idx" ON "support_reviews" USING btree ("actor_id");
  CREATE INDEX "support_reviews_updated_at_idx" ON "support_reviews" USING btree ("updated_at");
  CREATE INDEX "support_reviews_created_at_idx" ON "support_reviews" USING btree ("created_at");
  CREATE INDEX "support_retention_audits_actor_idx" ON "support_retention_audits" USING btree ("actor_id");
  CREATE UNIQUE INDEX "support_retention_audits_token_idx" ON "support_retention_audits" USING btree ("token");
  CREATE INDEX "support_retention_audits_updated_at_idx" ON "support_retention_audits" USING btree ("updated_at");
  CREATE INDEX "support_retention_audits_created_at_idx" ON "support_retention_audits" USING btree ("created_at");
  ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_voice_audio_id_support_voice_audio_id_fk" FOREIGN KEY ("voice_audio_id") REFERENCES "public"."support_voice_audio"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_voice_audio_fk" FOREIGN KEY ("support_voice_audio_id") REFERENCES "public"."support_voice_audio"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_voice_jobs_fk" FOREIGN KEY ("support_voice_jobs_id") REFERENCES "public"."support_voice_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_calls_fk" FOREIGN KEY ("support_calls_id") REFERENCES "public"."support_calls"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_call_presence_fk" FOREIGN KEY ("support_call_presence_id") REFERENCES "public"."support_call_presence"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_feedback_fk" FOREIGN KEY ("support_feedback_id") REFERENCES "public"."support_feedback"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_reviews_fk" FOREIGN KEY ("support_reviews_id") REFERENCES "public"."support_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_retention_audits_fk" FOREIGN KEY ("support_retention_audits_id") REFERENCES "public"."support_retention_audits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "support_messages_voice_audio_idx" ON "support_messages" USING btree ("voice_audio_id");
  CREATE INDEX "payload_locked_documents_rels_support_voice_audio_id_idx" ON "payload_locked_documents_rels" USING btree ("support_voice_audio_id");
  CREATE INDEX "payload_locked_documents_rels_support_voice_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("support_voice_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_support_calls_id_idx" ON "payload_locked_documents_rels" USING btree ("support_calls_id");
  CREATE INDEX "payload_locked_documents_rels_support_call_presence_id_idx" ON "payload_locked_documents_rels" USING btree ("support_call_presence_id");
  CREATE INDEX "payload_locked_documents_rels_support_feedback_id_idx" ON "payload_locked_documents_rels" USING btree ("support_feedback_id");
  CREATE INDEX "payload_locked_documents_rels_support_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("support_reviews_id");
  CREATE INDEX "payload_locked_documents_rels_support_retention_audits_i_idx" ON "payload_locked_documents_rels" USING btree ("support_retention_audits_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('Restore a verified backup to roll back support multimodal data; automatic destructive rollback is disabled.');
}
