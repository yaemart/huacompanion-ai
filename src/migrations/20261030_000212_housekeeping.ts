import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TYPE "public"."enum_inquiries_categories" ADD VALUE 'housekeeping' BEFORE 'medical';
  ALTER TYPE "public"."enum_inquiries_coordination_stage" ADD VALUE 'scheduled' BEFORE 'completed';
  ALTER TYPE "public"."enum_inquiries_coordination_stage" ADD VALUE 'aftercare' BEFORE 'completed';
  ALTER TYPE "public"."enum__inquiries_v_version_categories" ADD VALUE 'housekeeping' BEFORE 'medical';
  ALTER TYPE "public"."enum__inquiries_v_version_coordination_stage" ADD VALUE 'scheduled' BEFORE 'completed';
  ALTER TYPE "public"."enum__inquiries_v_version_coordination_stage" ADD VALUE 'aftercare' BEFORE 'completed';
  ALTER TYPE "public"."enum_providers_categories" ADD VALUE 'housekeeping' BEFORE 'medical';
  ALTER TYPE "public"."enum_providers_status" ADD VALUE 'needs-info' BEFORE 'verified';
  ALTER TYPE "public"."enum__providers_v_version_categories" ADD VALUE 'housekeeping' BEFORE 'medical';
  ALTER TYPE "public"."enum__providers_v_version_status" ADD VALUE 'needs-info' BEFORE 'verified';
  CREATE TABLE "inquiries_home_sharing_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"recipient" varchar,
  	"scope" varchar,
  	"consent_evidence" varchar,
  	"consent_at" timestamp(3) with time zone,
  	"shared_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "_inquiries_v_version_home_sharing_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"recipient" varchar,
  	"scope" varchar,
  	"consent_evidence" varchar,
  	"consent_at" timestamp(3) with time zone,
  	"shared_at" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_provider_id" integer;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_scope" varchar;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_quote" varchar;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_confirmation" varchar;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_full_address" varchar;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_scheduled_at" timestamp(3) with time zone;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_personnel" varchar;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_handover" varchar;
  ALTER TABLE "inquiries" ADD COLUMN "home_fulfilment_aftercare" varchar;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_provider_id" integer;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_scope" varchar;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_quote" varchar;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_confirmation" varchar;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_full_address" varchar;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_scheduled_at" timestamp(3) with time zone;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_personnel" varchar;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_handover" varchar;
  ALTER TABLE "_inquiries_v" ADD COLUMN "version_home_fulfilment_aftercare" varchar;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_application" jsonb;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_entity_evidence" varchar;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_staff_evidence" varchar;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_language_evidence" varchar;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_insurance_evidence" varchar;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_aftercare_evidence" varchar;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_commercial_terms" varchar;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "providers" ADD COLUMN "housekeeping_verification_reviewed" boolean DEFAULT false;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_application" jsonb;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_entity_evidence" varchar;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_staff_evidence" varchar;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_language_evidence" varchar;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_insurance_evidence" varchar;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_aftercare_evidence" varchar;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_commercial_terms" varchar;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "_providers_v" ADD COLUMN "version_housekeeping_verification_reviewed" boolean DEFAULT false;
  ALTER TABLE "inquiries_home_sharing_log" ADD CONSTRAINT "inquiries_home_sharing_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."inquiries"("id") ON \
DELETE cascade ON UPDATE no action;
  ALTER TABLE "_inquiries_v_version_home_sharing_log" ADD CONSTRAINT "_inquiries_v_version_home_sharing_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES \
"public"."_inquiries_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "inquiries_home_sharing_log_order_idx" ON "inquiries_home_sharing_log" USING btree ("_order");
  CREATE INDEX "inquiries_home_sharing_log_parent_id_idx" ON "inquiries_home_sharing_log" USING btree ("_parent_id");
  CREATE INDEX "_inquiries_v_version_home_sharing_log_order_idx" ON "_inquiries_v_version_home_sharing_log" USING btree ("_order");
  CREATE INDEX "_inquiries_v_version_home_sharing_log_parent_id_idx" ON "_inquiries_v_version_home_sharing_log" USING btree ("_parent_id");
  ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_home_fulfilment_provider_id_providers_id_fk" FOREIGN KEY ("home_fulfilment_provider_id") REFERENCES \
"public"."providers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_inquiries_v" ADD CONSTRAINT "_inquiries_v_version_home_fulfilment_provider_id_providers_id_fk" FOREIGN KEY ("version_home_fulfilment_provider_id") \
REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "inquiries_home_fulfilment_home_fulfilment_provider_idx" ON "inquiries" USING btree ("home_fulfilment_provider_id");
  CREATE INDEX "_inquiries_v_version_home_fulfilment_version_home_fulfil_idx" ON "_inquiries_v" USING btree ("version_home_fulfilment_provider_id");`);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    "Housekeeping customer and review data must be preserved; review rollback manually.",
  );
}
