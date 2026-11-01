import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_content_drafts_locale" AS ENUM('zh', 'en');
  CREATE TYPE "public"."enum_content_drafts_review_state" AS ENUM('draft', 'review', 'returned', 'approved');
  CREATE TYPE "public"."enum__content_drafts_v_version_locale" AS ENUM('zh', 'en');
  CREATE TYPE "public"."enum__content_drafts_v_version_review_state" AS ENUM('draft', 'review', 'returned', 'approved');
  CREATE TABLE "content_drafts" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "content_key" varchar NOT NULL,
    "locale" "enum_content_drafts_locale" NOT NULL,
    "kind" varchar NOT NULL,
    "slug" varchar NOT NULL,
    "identity" varchar NOT NULL,
    "route_key" varchar NOT NULL,
    "body" jsonb NOT NULL,
    "revision" numeric NOT NULL,
    "review_state" "enum_content_drafts_review_state" NOT NULL,
    "review_note" varchar,
    "ever_published" boolean DEFAULT false,
    "source_revision" numeric,
    "source_draft" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_content_drafts_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_title" varchar NOT NULL,
    "version_content_key" varchar NOT NULL,
    "version_locale" "enum__content_drafts_v_version_locale" NOT NULL,
    "version_kind" varchar NOT NULL,
    "version_slug" varchar NOT NULL,
    "version_identity" varchar NOT NULL,
    "version_route_key" varchar NOT NULL,
    "version_body" jsonb NOT NULL,
    "version_revision" numeric NOT NULL,
    "version_review_state" "enum__content_drafts_v_version_review_state" NOT NULL,
    "version_review_note" varchar,
    "version_ever_published" boolean DEFAULT false,
    "version_source_revision" numeric,
    "version_source_draft" numeric,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "content_published" (
    "id" serial PRIMARY KEY NOT NULL,
    "draft_id" numeric NOT NULL,
    "route_key" varchar NOT NULL,
    "active" boolean DEFAULT true,
    "revision" numeric NOT NULL,
    "body" jsonb NOT NULL,
    "published_by" numeric NOT NULL,
    "published_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "content_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "draft_id" numeric NOT NULL,
    "action" varchar NOT NULL,
    "actor" numeric NOT NULL,
    "revision" numeric,
    "snapshot" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "content_media" (
    "id" serial PRIMARY KEY NOT NULL,
    "filename" varchar NOT NULL,
    "alt" varchar NOT NULL,
    "rights" varchar NOT NULL,
    "size" numeric NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "content_agent_tasks" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "kind" varchar NOT NULL,
    "status" varchar NOT NULL,
    "input" jsonb NOT NULL,
    "result" jsonb,
    "error" varchar,
    "attempts" numeric DEFAULT 0,
    "lease" varchar,
    "lease_until" timestamp(3) with time zone,
    "usage" jsonb,
    "adopted_draft" numeric,
    "created_by" numeric NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_drafts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_published_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_media_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_agent_tasks_id" integer;
  ALTER TABLE "_content_drafts_v" ADD CONSTRAINT "_content_drafts_v_parent_id_content_drafts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."content_drafts"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "content_drafts_identity_idx" ON "content_drafts" USING btree ("identity");
  CREATE UNIQUE INDEX "content_drafts_route_key_idx" ON "content_drafts" USING btree ("route_key");
  CREATE INDEX "content_drafts_updated_at_idx" ON "content_drafts" USING btree ("updated_at");
  CREATE INDEX "content_drafts_created_at_idx" ON "content_drafts" USING btree ("created_at");
  CREATE INDEX "_content_drafts_v_parent_idx" ON "_content_drafts_v" USING btree ("parent_id");
  CREATE INDEX "_content_drafts_v_version_version_identity_idx" ON "_content_drafts_v" USING btree ("version_identity");
  CREATE INDEX "_content_drafts_v_version_version_route_key_idx" ON "_content_drafts_v" USING btree ("version_route_key");
  CREATE INDEX "_content_drafts_v_version_version_updated_at_idx" ON "_content_drafts_v" USING btree ("version_updated_at");
  CREATE INDEX "_content_drafts_v_version_version_created_at_idx" ON "_content_drafts_v" USING btree ("version_created_at");
  CREATE INDEX "_content_drafts_v_created_at_idx" ON "_content_drafts_v" USING btree ("created_at");
  CREATE INDEX "_content_drafts_v_updated_at_idx" ON "_content_drafts_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "content_published_draft_id_idx" ON "content_published" USING btree ("draft_id");
  CREATE UNIQUE INDEX "content_published_route_key_idx" ON "content_published" USING btree ("route_key");
  CREATE INDEX "content_published_updated_at_idx" ON "content_published" USING btree ("updated_at");
  CREATE INDEX "content_published_created_at_idx" ON "content_published" USING btree ("created_at");
  CREATE INDEX "content_events_updated_at_idx" ON "content_events" USING btree ("updated_at");
  CREATE INDEX "content_events_created_at_idx" ON "content_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "content_media_filename_idx" ON "content_media" USING btree ("filename");
  CREATE INDEX "content_media_updated_at_idx" ON "content_media" USING btree ("updated_at");
  CREATE INDEX "content_media_created_at_idx" ON "content_media" USING btree ("created_at");
  CREATE INDEX "content_agent_tasks_updated_at_idx" ON "content_agent_tasks" USING btree ("updated_at");
  CREATE INDEX "content_agent_tasks_created_at_idx" ON "content_agent_tasks" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_drafts_fk" FOREIGN KEY ("content_drafts_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_published_fk" FOREIGN KEY ("content_published_id") REFERENCES "public"."content_published"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_events_fk" FOREIGN KEY ("content_events_id") REFERENCES "public"."content_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_media_fk" FOREIGN KEY ("content_media_id") REFERENCES "public"."content_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_agent_tasks_fk" FOREIGN KEY ("content_agent_tasks_id") REFERENCES "public"."content_agent_tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_content_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("content_drafts_id");
  CREATE INDEX "payload_locked_documents_rels_content_published_id_idx" ON "payload_locked_documents_rels" USING btree ("content_published_id");
  CREATE INDEX "payload_locked_documents_rels_content_events_id_idx" ON "payload_locked_documents_rels" USING btree ("content_events_id");
  CREATE INDEX "payload_locked_documents_rels_content_media_id_idx" ON "payload_locked_documents_rels" USING btree ("content_media_id");
  CREATE INDEX "payload_locked_documents_rels_content_agent_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("content_agent_tasks_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "content_drafts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_content_drafts_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "content_published" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "content_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "content_media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "content_agent_tasks" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "content_drafts" CASCADE;
  DROP TABLE "_content_drafts_v" CASCADE;
  DROP TABLE "content_published" CASCADE;
  DROP TABLE "content_events" CASCADE;
  DROP TABLE "content_media" CASCADE;
  DROP TABLE "content_agent_tasks" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_content_drafts_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_content_published_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_content_events_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_content_media_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_content_agent_tasks_fk";

  DROP INDEX "payload_locked_documents_rels_content_drafts_id_idx";
  DROP INDEX "payload_locked_documents_rels_content_published_id_idx";
  DROP INDEX "payload_locked_documents_rels_content_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_content_media_id_idx";
  DROP INDEX "payload_locked_documents_rels_content_agent_tasks_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "content_drafts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "content_published_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "content_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "content_media_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "content_agent_tasks_id";
  DROP TYPE "public"."enum_content_drafts_locale";
  DROP TYPE "public"."enum_content_drafts_review_state";
  DROP TYPE "public"."enum__content_drafts_v_version_locale";
  DROP TYPE "public"."enum__content_drafts_v_version_review_state";`);
}
