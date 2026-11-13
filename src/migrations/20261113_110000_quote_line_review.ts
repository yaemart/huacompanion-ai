import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    "ALTER TABLE public_company_settings ADD COLUMN allow_quote_collection boolean DEFAULT false",
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`LOCK TABLE public_company_settings, service_quotes IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM public_company_settings WHERE allow_quote_collection)
         OR EXISTS (SELECT 1 FROM service_quotes WHERE line_format=2 AND review_status IS NOT NULL) THEN
        RAISE EXCEPTION 'Preserve reviewed quote lines and collection settings before rollback';
      END IF;
    END $$;
    ALTER TABLE public_company_settings DROP COLUMN allow_quote_collection;`);
}
