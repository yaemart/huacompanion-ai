import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres';

// Additive only: existing content and service-language capabilities are unchanged.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
ALTER TYPE "public"."enum_inquiries_locale" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "public"."enum_inquiries_locale" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "public"."enum_inquiries_locale" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "public"."enum_inquiries_locale" ADD VALUE IF NOT EXISTS 'it';
ALTER TYPE "public"."enum_inquiries_locale" ADD VALUE IF NOT EXISTS 'ar';
ALTER TYPE "public"."enum__inquiries_v_version_locale" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "public"."enum__inquiries_v_version_locale" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "public"."enum__inquiries_v_version_locale" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "public"."enum__inquiries_v_version_locale" ADD VALUE IF NOT EXISTS 'it';
ALTER TYPE "public"."enum__inquiries_v_version_locale" ADD VALUE IF NOT EXISTS 'ar';
ALTER TYPE "public"."enum_providers_locale" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "public"."enum_providers_locale" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "public"."enum_providers_locale" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "public"."enum_providers_locale" ADD VALUE IF NOT EXISTS 'it';
ALTER TYPE "public"."enum_providers_locale" ADD VALUE IF NOT EXISTS 'ar';
ALTER TYPE "public"."enum__providers_v_version_locale" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "public"."enum__providers_v_version_locale" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "public"."enum__providers_v_version_locale" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "public"."enum__providers_v_version_locale" ADD VALUE IF NOT EXISTS 'it';
ALTER TYPE "public"."enum__providers_v_version_locale" ADD VALUE IF NOT EXISTS 'ar';
ALTER TYPE "public"."enum_content_drafts_locale" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "public"."enum_content_drafts_locale" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "public"."enum_content_drafts_locale" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "public"."enum_content_drafts_locale" ADD VALUE IF NOT EXISTS 'it';
ALTER TYPE "public"."enum_content_drafts_locale" ADD VALUE IF NOT EXISTS 'ar';
ALTER TYPE "public"."enum__content_drafts_v_version_locale" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "public"."enum__content_drafts_v_version_locale" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "public"."enum__content_drafts_v_version_locale" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "public"."enum__content_drafts_v_version_locale" ADD VALUE IF NOT EXISTS 'it';
ALTER TYPE "public"."enum__content_drafts_v_version_locale" ADD VALUE IF NOT EXISTS 'ar';
  `);
}

// PostgreSQL enum labels cannot be removed safely while translated records exist.
// Rollback must never delete or silently reassign the language of those records.
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error("Seven-language migration is additive; rollback requires explicit data review.");
}
