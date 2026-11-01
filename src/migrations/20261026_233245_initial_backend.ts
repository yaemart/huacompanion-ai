import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_staff_role" AS ENUM('admin', 'operations', 'editor');
  CREATE TYPE "public"."enum_inquiries_categories" AS ENUM('medical', 'business', 'transport', 'stays', 'travel', 'interpretation', 'arrival');
  CREATE TYPE "public"."enum_inquiries_source" AS ENUM('website', 'app', 'manual');
  CREATE TYPE "public"."enum_inquiries_locale" AS ENUM('en', 'zh');
  CREATE TYPE "public"."enum_inquiries_status" AS ENUM('new', 'needs-info', 'processing', 'quoted', 'won', 'closed');
  CREATE TYPE "public"."enum__inquiries_v_version_categories" AS ENUM('medical', 'business', 'transport', 'stays', 'travel', 'interpretation', 'arrival');
  CREATE TYPE "public"."enum__inquiries_v_version_source" AS ENUM('website', 'app', 'manual');
  CREATE TYPE "public"."enum__inquiries_v_version_locale" AS ENUM('en', 'zh');
  CREATE TYPE "public"."enum__inquiries_v_version_status" AS ENUM('new', 'needs-info', 'processing', 'quoted', 'won', 'closed');
  CREATE TYPE "public"."enum_providers_categories" AS ENUM('medical', 'business', 'transport', 'stays', 'travel', 'interpretation', 'arrival');
  CREATE TYPE "public"."enum_providers_source" AS ENUM('website', 'app', 'manual');
  CREATE TYPE "public"."enum_providers_locale" AS ENUM('en', 'zh');
  CREATE TYPE "public"."enum_providers_status" AS ENUM('applied', 'verified', 'contracted', 'paused');
  CREATE TYPE "public"."enum__providers_v_version_categories" AS ENUM('medical', 'business', 'transport', 'stays', 'travel', 'interpretation', 'arrival');
  CREATE TYPE "public"."enum__providers_v_version_source" AS ENUM('website', 'app', 'manual');
  CREATE TYPE "public"."enum__providers_v_version_locale" AS ENUM('en', 'zh');
  CREATE TYPE "public"."enum__providers_v_version_status" AS ENUM('applied', 'verified', 'contracted', 'paused');
  CREATE TYPE "public"."enum_notifications_kind" AS ENUM('request', 'apply');
  CREATE TYPE "public"."enum_notifications_status" AS ENUM('awaiting-configuration', 'pending', 'failed', 'accepted', 'delivered');
  CREATE TABLE "staff_sessions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "created_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "staff" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "role" "enum_staff_role" DEFAULT 'editor' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "email" varchar NOT NULL,
    "reset_password_token" varchar,
    "reset_password_expiration" timestamp(3) with time zone,
    "salt" varchar,
    "hash" varchar,
    "reset_password_requested_at" timestamp(3) with time zone,
    "login_attempts" numeric DEFAULT 0,
    "lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "inquiries_categories" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum_inquiries_categories",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "inquiries" (
    "id" serial PRIMARY KEY NOT NULL,
    "reference" varchar NOT NULL,
    "name" varchar NOT NULL,
    "email" varchar NOT NULL,
    "city" varchar NOT NULL,
    "details" jsonb,
    "source" "enum_inquiries_source" DEFAULT 'website',
    "locale" "enum_inquiries_locale" DEFAULT 'en',
    "consent_at" timestamp(3) with time zone,
    "privacy_version" varchar,
    "request_key" varchar NOT NULL,
    "content_hash" varchar NOT NULL,
    "status" "enum_inquiries_status" DEFAULT 'new' NOT NULL,
    "owner_id" integer,
    "next_follow_up" timestamp(3) with time zone,
    "notes" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_inquiries_v_version_categories" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum__inquiries_v_version_categories",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "_inquiries_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_reference" varchar NOT NULL,
    "version_name" varchar NOT NULL,
    "version_email" varchar NOT NULL,
    "version_city" varchar NOT NULL,
    "version_details" jsonb,
    "version_source" "enum__inquiries_v_version_source" DEFAULT 'website',
    "version_locale" "enum__inquiries_v_version_locale" DEFAULT 'en',
    "version_consent_at" timestamp(3) with time zone,
    "version_privacy_version" varchar,
    "version_request_key" varchar NOT NULL,
    "version_content_hash" varchar NOT NULL,
    "version_status" "enum__inquiries_v_version_status" DEFAULT 'new' NOT NULL,
    "version_owner_id" integer,
    "version_next_follow_up" timestamp(3) with time zone,
    "version_notes" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "providers_categories" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum_providers_categories",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "providers" (
    "id" serial PRIMARY KEY NOT NULL,
    "reference" varchar NOT NULL,
    "name" varchar NOT NULL,
    "email" varchar NOT NULL,
    "city" varchar NOT NULL,
    "details" jsonb,
    "source" "enum_providers_source" DEFAULT 'website',
    "locale" "enum_providers_locale" DEFAULT 'en',
    "consent_at" timestamp(3) with time zone,
    "privacy_version" varchar,
    "request_key" varchar NOT NULL,
    "content_hash" varchar NOT NULL,
    "organisation" varchar NOT NULL,
    "phone" varchar NOT NULL,
    "languages" varchar NOT NULL,
    "capabilities" varchar NOT NULL,
    "website" varchar,
    "hours" varchar,
    "qualification" varchar,
    "status" "enum_providers_status" DEFAULT 'applied' NOT NULL,
    "public_approved" boolean DEFAULT false,
    "notes" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_providers_v_version_categories" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum__providers_v_version_categories",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "_providers_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_reference" varchar NOT NULL,
    "version_name" varchar NOT NULL,
    "version_email" varchar NOT NULL,
    "version_city" varchar NOT NULL,
    "version_details" jsonb,
    "version_source" "enum__providers_v_version_source" DEFAULT 'website',
    "version_locale" "enum__providers_v_version_locale" DEFAULT 'en',
    "version_consent_at" timestamp(3) with time zone,
    "version_privacy_version" varchar,
    "version_request_key" varchar NOT NULL,
    "version_content_hash" varchar NOT NULL,
    "version_organisation" varchar NOT NULL,
    "version_phone" varchar NOT NULL,
    "version_languages" varchar NOT NULL,
    "version_capabilities" varchar NOT NULL,
    "version_website" varchar,
    "version_hours" varchar,
    "version_qualification" varchar,
    "version_status" "enum__providers_v_version_status" DEFAULT 'applied' NOT NULL,
    "version_public_approved" boolean DEFAULT false,
    "version_notes" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "notifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "reference" varchar NOT NULL,
    "kind" "enum_notifications_kind" NOT NULL,
    "status" "enum_notifications_status" DEFAULT 'awaiting-configuration',
    "attempts" numeric DEFAULT 0,
    "last_error" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "audit_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "entity" varchar NOT NULL,
    "record_id" varchar NOT NULL,
    "action" varchar NOT NULL,
    "actor_id" integer,
    "fields" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_kv" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
    "id" serial PRIMARY KEY NOT NULL,
    "global_slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "staff_id" integer,
    "inquiries_id" integer,
    "providers_id" integer,
    "notifications_id" integer,
    "audit_events_id" integer
  );

  CREATE TABLE "payload_preferences" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar,
    "value" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "staff_id" integer
  );

  CREATE TABLE "payload_migrations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "batch" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inquiries_categories" ADD CONSTRAINT "inquiries_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_inquiries_v_version_categories" ADD CONSTRAINT "_inquiries_v_version_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_inquiries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_inquiries_v" ADD CONSTRAINT "_inquiries_v_parent_id_inquiries_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_inquiries_v" ADD CONSTRAINT "_inquiries_v_version_owner_id_staff_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "providers_categories" ADD CONSTRAINT "providers_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_providers_v_version_categories" ADD CONSTRAINT "_providers_v_version_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_providers_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_providers_v" ADD CONSTRAINT "_providers_v_parent_id_providers_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inquiries_fk" FOREIGN KEY ("inquiries_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_providers_fk" FOREIGN KEY ("providers_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_events_fk" FOREIGN KEY ("audit_events_id") REFERENCES "public"."audit_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "staff_sessions_order_idx" ON "staff_sessions" USING btree ("_order");
  CREATE INDEX "staff_sessions_parent_id_idx" ON "staff_sessions" USING btree ("_parent_id");
  CREATE INDEX "staff_updated_at_idx" ON "staff" USING btree ("updated_at");
  CREATE INDEX "staff_created_at_idx" ON "staff" USING btree ("created_at");
  CREATE UNIQUE INDEX "staff_email_idx" ON "staff" USING btree ("email");
  CREATE INDEX "inquiries_categories_order_idx" ON "inquiries_categories" USING btree ("order");
  CREATE INDEX "inquiries_categories_parent_idx" ON "inquiries_categories" USING btree ("parent_id");
  CREATE UNIQUE INDEX "inquiries_reference_idx" ON "inquiries" USING btree ("reference");
  CREATE UNIQUE INDEX "inquiries_request_key_idx" ON "inquiries" USING btree ("request_key");
  CREATE INDEX "inquiries_owner_idx" ON "inquiries" USING btree ("owner_id");
  CREATE INDEX "inquiries_updated_at_idx" ON "inquiries" USING btree ("updated_at");
  CREATE INDEX "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at");
  CREATE INDEX "_inquiries_v_version_categories_order_idx" ON "_inquiries_v_version_categories" USING btree ("order");
  CREATE INDEX "_inquiries_v_version_categories_parent_idx" ON "_inquiries_v_version_categories" USING btree ("parent_id");
  CREATE INDEX "_inquiries_v_parent_idx" ON "_inquiries_v" USING btree ("parent_id");
  CREATE INDEX "_inquiries_v_version_version_reference_idx" ON "_inquiries_v" USING btree ("version_reference");
  CREATE INDEX "_inquiries_v_version_version_request_key_idx" ON "_inquiries_v" USING btree ("version_request_key");
  CREATE INDEX "_inquiries_v_version_version_owner_idx" ON "_inquiries_v" USING btree ("version_owner_id");
  CREATE INDEX "_inquiries_v_version_version_updated_at_idx" ON "_inquiries_v" USING btree ("version_updated_at");
  CREATE INDEX "_inquiries_v_version_version_created_at_idx" ON "_inquiries_v" USING btree ("version_created_at");
  CREATE INDEX "_inquiries_v_created_at_idx" ON "_inquiries_v" USING btree ("created_at");
  CREATE INDEX "_inquiries_v_updated_at_idx" ON "_inquiries_v" USING btree ("updated_at");
  CREATE INDEX "providers_categories_order_idx" ON "providers_categories" USING btree ("order");
  CREATE INDEX "providers_categories_parent_idx" ON "providers_categories" USING btree ("parent_id");
  CREATE UNIQUE INDEX "providers_reference_idx" ON "providers" USING btree ("reference");
  CREATE UNIQUE INDEX "providers_request_key_idx" ON "providers" USING btree ("request_key");
  CREATE INDEX "providers_updated_at_idx" ON "providers" USING btree ("updated_at");
  CREATE INDEX "providers_created_at_idx" ON "providers" USING btree ("created_at");
  CREATE INDEX "_providers_v_version_categories_order_idx" ON "_providers_v_version_categories" USING btree ("order");
  CREATE INDEX "_providers_v_version_categories_parent_idx" ON "_providers_v_version_categories" USING btree ("parent_id");
  CREATE INDEX "_providers_v_parent_idx" ON "_providers_v" USING btree ("parent_id");
  CREATE INDEX "_providers_v_version_version_reference_idx" ON "_providers_v" USING btree ("version_reference");
  CREATE INDEX "_providers_v_version_version_request_key_idx" ON "_providers_v" USING btree ("version_request_key");
  CREATE INDEX "_providers_v_version_version_updated_at_idx" ON "_providers_v" USING btree ("version_updated_at");
  CREATE INDEX "_providers_v_version_version_created_at_idx" ON "_providers_v" USING btree ("version_created_at");
  CREATE INDEX "_providers_v_created_at_idx" ON "_providers_v" USING btree ("created_at");
  CREATE INDEX "_providers_v_updated_at_idx" ON "_providers_v" USING btree ("updated_at");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");
  CREATE INDEX "audit_events_updated_at_idx" ON "audit_events" USING btree ("updated_at");
  CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_staff_id_idx" ON "payload_locked_documents_rels" USING btree ("staff_id");
  CREATE INDEX "payload_locked_documents_rels_inquiries_id_idx" ON "payload_locked_documents_rels" USING btree ("inquiries_id");
  CREATE INDEX "payload_locked_documents_rels_providers_id_idx" ON "payload_locked_documents_rels" USING btree ("providers_id");
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX "payload_locked_documents_rels_audit_events_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_events_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_staff_id_idx" ON "payload_preferences_rels" USING btree ("staff_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   DROP TABLE "staff_sessions" CASCADE;
  DROP TABLE "staff" CASCADE;
  DROP TABLE "inquiries_categories" CASCADE;
  DROP TABLE "inquiries" CASCADE;
  DROP TABLE "_inquiries_v_version_categories" CASCADE;
  DROP TABLE "_inquiries_v" CASCADE;
  DROP TABLE "providers_categories" CASCADE;
  DROP TABLE "providers" CASCADE;
  DROP TABLE "_providers_v_version_categories" CASCADE;
  DROP TABLE "_providers_v" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "audit_events" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_staff_role";
  DROP TYPE "public"."enum_inquiries_categories";
  DROP TYPE "public"."enum_inquiries_source";
  DROP TYPE "public"."enum_inquiries_locale";
  DROP TYPE "public"."enum_inquiries_status";
  DROP TYPE "public"."enum__inquiries_v_version_categories";
  DROP TYPE "public"."enum__inquiries_v_version_source";
  DROP TYPE "public"."enum__inquiries_v_version_locale";
  DROP TYPE "public"."enum__inquiries_v_version_status";
  DROP TYPE "public"."enum_providers_categories";
  DROP TYPE "public"."enum_providers_source";
  DROP TYPE "public"."enum_providers_locale";
  DROP TYPE "public"."enum_providers_status";
  DROP TYPE "public"."enum__providers_v_version_categories";
  DROP TYPE "public"."enum__providers_v_version_source";
  DROP TYPE "public"."enum__providers_v_version_locale";
  DROP TYPE "public"."enum__providers_v_version_status";
  DROP TYPE "public"."enum_notifications_kind";
  DROP TYPE "public"."enum_notifications_status";`);
}
