import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TYPE "public"."enum_imm_policies_policy_type" AS ENUM('unilateral', 'bilateral', 'transit-240h', 'other');
  CREATE TYPE "public"."enum_imm_policies_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__imm_policies_v_version_policy_type" AS ENUM('unilateral', 'bilateral', 'transit-240h', 'other');
  CREATE TYPE "public"."enum__imm_policies_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "imm_policies_ports_and_regions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar NOT NULL
  );

  CREATE TABLE "imm_policies" (
    "id" serial PRIMARY KEY NOT NULL,
    "policy_key" varchar NOT NULL,
    "country_code" varchar,
    "country_name_en" varchar,
    "country_name_zh" varchar,
    "policy_type" "enum_imm_policies_policy_type",
    "max_stay_days" numeric,
    "valid_from" varchar,
    "valid_until" varchar,
    "official_source_url" varchar,
    "last_verified_on" varchar,
    "verified_by_id" integer,
    "public_notes" varchar,
    "internal_notes" varchar,
    "status" "enum_imm_policies_status" DEFAULT 'draft' NOT NULL,
    "revision" numeric DEFAULT 1 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_imm_policies_v_version_ports_and_regions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_imm_policies_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_policy_key" varchar NOT NULL,
    "version_country_code" varchar,
    "version_country_name_en" varchar,
    "version_country_name_zh" varchar,
    "version_policy_type" "enum__imm_policies_v_version_policy_type",
    "version_max_stay_days" numeric,
    "version_valid_from" varchar,
    "version_valid_until" varchar,
    "version_official_source_url" varchar,
    "version_last_verified_on" varchar,
    "version_verified_by_id" integer,
    "version_public_notes" varchar,
    "version_internal_notes" varchar,
    "version_status" "enum__imm_policies_v_version_status" DEFAULT 'draft' NOT NULL,
    "version_revision" numeric DEFAULT 1 NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "imm_policies_id" integer;
  ALTER TABLE "imm_policies_ports_and_regions" ADD CONSTRAINT "imm_policies_ports_and_regions_parent_id_fk"
    FOREIGN KEY ("_parent_id") REFERENCES "public"."imm_policies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "imm_policies" ADD CONSTRAINT "imm_policies_verified_by_id_staff_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_imm_policies_v_version_ports_and_regions" ADD CONSTRAINT "_imm_policies_v_version_ports_and_regions_parent_id_fk"
    FOREIGN KEY ("_parent_id") REFERENCES "public"."_imm_policies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_imm_policies_v" ADD CONSTRAINT "_imm_policies_v_parent_id_imm_policies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."imm_policies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_imm_policies_v" ADD CONSTRAINT "_imm_policies_v_version_verified_by_id_staff_id_fk"
    FOREIGN KEY ("version_verified_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "imm_policies_ports_and_regions_order_idx" ON "imm_policies_ports_and_regions" USING btree ("_order");
  CREATE INDEX "imm_policies_ports_and_regions_parent_id_idx" ON "imm_policies_ports_and_regions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "imm_policies_policy_key_idx" ON "imm_policies" USING btree ("policy_key");
  CREATE INDEX "imm_policies_country_code_idx" ON "imm_policies" USING btree ("country_code");
  CREATE INDEX "imm_policies_verified_by_idx" ON "imm_policies" USING btree ("verified_by_id");
  CREATE INDEX "imm_policies_updated_at_idx" ON "imm_policies" USING btree ("updated_at");
  CREATE INDEX "imm_policies_created_at_idx" ON "imm_policies" USING btree ("created_at");
  CREATE INDEX "_imm_policies_v_version_ports_and_regions_order_idx" ON "_imm_policies_v_version_ports_and_regions" USING btree ("_order");
  CREATE INDEX "_imm_policies_v_version_ports_and_regions_parent_id_idx" ON "_imm_policies_v_version_ports_and_regions" USING btree ("_parent_id");
  CREATE INDEX "_imm_policies_v_parent_idx" ON "_imm_policies_v" USING btree ("parent_id");
  CREATE INDEX "_imm_policies_v_version_version_policy_key_idx" ON "_imm_policies_v" USING btree ("version_policy_key");
  CREATE INDEX "_imm_policies_v_version_version_country_code_idx" ON "_imm_policies_v" USING btree ("version_country_code");
  CREATE INDEX "_imm_policies_v_version_version_verified_by_idx" ON "_imm_policies_v" USING btree ("version_verified_by_id");
  CREATE INDEX "_imm_policies_v_version_version_updated_at_idx" ON "_imm_policies_v" USING btree ("version_updated_at");
  CREATE INDEX "_imm_policies_v_version_version_created_at_idx" ON "_imm_policies_v" USING btree ("version_created_at");
  CREATE INDEX "_imm_policies_v_created_at_idx" ON "_imm_policies_v" USING btree ("created_at");
  CREATE INDEX "_imm_policies_v_updated_at_idx" ON "_imm_policies_v" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_immigration_policies_fk"
    FOREIGN KEY ("imm_policies_id") REFERENCES "public"."imm_policies"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_imm_policies_id_idx" ON "payload_locked_documents_rels" USING btree ("imm_policies_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "imm_policies_ports_and_regions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "imm_policies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_imm_policies_v_version_ports_and_regions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_imm_policies_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_immigration_policies_fk";
  DROP TABLE "imm_policies_ports_and_regions" CASCADE;
  DROP TABLE "imm_policies" CASCADE;
  DROP TABLE "_imm_policies_v_version_ports_and_regions" CASCADE;
  DROP TABLE "_imm_policies_v" CASCADE;

  DROP INDEX "payload_locked_documents_rels_imm_policies_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "imm_policies_id";
  DROP TYPE "public"."enum_imm_policies_policy_type";
  DROP TYPE "public"."enum_imm_policies_status";
  DROP TYPE "public"."enum__imm_policies_v_version_policy_type";
  DROP TYPE "public"."enum__imm_policies_v_version_status";`);
}
