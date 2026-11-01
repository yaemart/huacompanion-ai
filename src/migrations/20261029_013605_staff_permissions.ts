import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_staff_content_kinds" AS ENUM('service', 'guide', 'faq', 'page', 'partner', 'provider-profile', 'service-project', 'exhibition', 'institution');
  CREATE TYPE "public"."enum_staff_additional_roles" AS ENUM('admin', 'manager', 'operations', 'editor', 'reviewer');
  ALTER TYPE "public"."enum_staff_role" ADD VALUE 'manager' BEFORE 'operations';
  ALTER TYPE "public"."enum_staff_role" ADD VALUE 'reviewer' BEFORE 'operations';
  CREATE TABLE "teams" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "staff_content_kinds" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_staff_content_kinds",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "staff_additional_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_staff_additional_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "staff" ADD COLUMN "active" boolean DEFAULT true;
  ALTER TABLE "staff" ADD COLUMN "team_id" integer;
  ALTER TABLE "inquiries" ADD COLUMN "team_id" integer;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_team_id" integer;
  ALTER TABLE "providers" ADD COLUMN "team_id" integer;
  ALTER TABLE "providers" ADD COLUMN "owner_id" integer;
  ALTER TABLE "_providers_v" ADD COLUMN "version_team_id" integer;
  ALTER TABLE "_providers_v" ADD COLUMN "version_owner_id" integer;
  ALTER TABLE "audit_events" ADD COLUMN "before" jsonb;
  ALTER TABLE "audit_events" ADD COLUMN "after" jsonb;
  ALTER TABLE "content_drafts" ADD COLUMN "last_edited_by" numeric;
  ALTER TABLE "content_drafts" ADD COLUMN "submitted_by" numeric;
  ALTER TABLE "_content_drafts_v" ADD COLUMN "version_last_edited_by" numeric;
  ALTER TABLE "_content_drafts_v" ADD COLUMN "version_submitted_by" numeric;
  ALTER TABLE "content_events" ADD COLUMN "override_reason" varchar;
  ALTER TABLE "content_media" ADD COLUMN "uploaded_by" numeric;
  ALTER TABLE "content_agent_tasks" ADD COLUMN "content_kind" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "teams_id" integer;
  ALTER TABLE "staff_content_kinds" ADD CONSTRAINT "staff_content_kinds_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "staff_additional_roles" ADD CONSTRAINT "staff_additional_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "teams_name_idx" ON "teams" USING btree ("name");
  CREATE INDEX "teams_updated_at_idx" ON "teams" USING btree ("updated_at");
  CREATE INDEX "teams_created_at_idx" ON "teams" USING btree ("created_at");
  CREATE INDEX "staff_content_kinds_order_idx" ON "staff_content_kinds" USING btree ("order");
  CREATE INDEX "staff_content_kinds_parent_idx" ON "staff_content_kinds" USING btree ("parent_id");
  CREATE INDEX "staff_additional_roles_order_idx" ON "staff_additional_roles" USING btree ("order");
  CREATE INDEX "staff_additional_roles_parent_idx" ON "staff_additional_roles" USING btree ("parent_id");
  ALTER TABLE "staff" ADD CONSTRAINT "staff_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_inquiries_v" ADD CONSTRAINT "_inquiries_v_version_team_id_teams_id_fk" FOREIGN KEY ("version_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "providers" ADD CONSTRAINT "providers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "providers" ADD CONSTRAINT "providers_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_providers_v" ADD CONSTRAINT "_providers_v_version_team_id_teams_id_fk" FOREIGN KEY ("version_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_providers_v" ADD CONSTRAINT "_providers_v_version_owner_id_staff_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teams_fk" FOREIGN KEY ("teams_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "staff_team_idx" ON "staff" USING btree ("team_id");
  CREATE INDEX "inquiries_team_idx" ON "inquiries" USING btree ("team_id");
  CREATE INDEX "_inquiries_v_version_version_team_idx" ON "_inquiries_v" USING btree ("version_team_id");
  CREATE INDEX "providers_team_idx" ON "providers" USING btree ("team_id");
  CREATE INDEX "providers_owner_idx" ON "providers" USING btree ("owner_id");
  CREATE INDEX "_providers_v_version_version_team_idx" ON "_providers_v" USING btree ("version_team_id");
  CREATE INDEX "_providers_v_version_version_owner_idx" ON "_providers_v" USING btree ("version_owner_id");
  CREATE INDEX "payload_locked_documents_rels_teams_id_idx" ON "payload_locked_documents_rels" USING btree ("teams_id");
  UPDATE "content_agent_tasks" SET "content_kind" = CASE WHEN "input"->'source'->>'kind' IN ('service','guide','faq','page','partner','provider-profile','service-project','exhibition','institution') THEN "input"->'source'->>'kind' ELSE 'guide' END;
  ALTER TABLE "content_agent_tasks" ALTER COLUMN "content_kind" SET NOT NULL;
  INSERT INTO "staff_content_kinds" ("order", "parent_id", "value")
    SELECT ordinality, staff.id, kind::"enum_staff_content_kinds" FROM "staff"
    CROSS JOIN unnest(ARRAY['service','guide','faq','page','partner','provider-profile','service-project','exhibition','institution']) WITH ORDINALITY AS k(kind, ordinality)
    WHERE staff.role IN ('admin','editor');
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    "Permission assignments and audit history require explicit review before rollback.",
  );
}
