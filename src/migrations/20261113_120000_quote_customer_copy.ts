import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`ALTER TABLE public_company_settings
    ADD COLUMN quote_referral_notice varchar,
    ADD COLUMN quote_managed_notice varchar,
    ADD COLUMN quote_collection_notice varchar`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`LOCK TABLE public_company_settings, service_quotes IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM public_company_settings WHERE
        NULLIF(btrim(quote_referral_notice), '') IS NOT NULL OR
        NULLIF(btrim(quote_managed_notice), '') IS NOT NULL OR
        NULLIF(btrim(quote_collection_notice), '') IS NOT NULL)
        OR EXISTS (SELECT 1 FROM service_quotes WHERE lines @? '$[*].customerNotice'
          OR (status = 'draft' AND lines @?
            '$[*].collectionNotice ? (@ != "本项由华伴统一收款后支付给服务方")')) THEN
        RAISE EXCEPTION 'Preserve quote notice settings and versions before rollback';
      END IF;
    END $$;
    ALTER TABLE public_company_settings
      DROP COLUMN quote_referral_notice,
      DROP COLUMN quote_managed_notice,
      DROP COLUMN quote_collection_notice;`);
}
