import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`ALTER TABLE "service_quotes" ADD COLUMN "line_format" numeric;
  CREATE TABLE "service_quote_line_costs" (
    "id" serial PRIMARY KEY NOT NULL,
    "quote_id" integer NOT NULL,
    "line_id" varchar NOT NULL,
    "cost_minor" numeric NOT NULL,
    CONSTRAINT "service_quote_line_costs_quote_id_service_quotes_id_fk"
      FOREIGN KEY ("quote_id") REFERENCES "service_quotes"("id") ON DELETE SET NULL
  );
  CREATE INDEX "service_quote_line_costs_quote_idx" ON "service_quote_line_costs" ("quote_id");
  CREATE UNIQUE INDEX "quote_lineId_idx" ON "service_quote_line_costs" ("quote_id", "line_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`LOCK TABLE "service_quotes", "service_quote_line_costs" IN ACCESS EXCLUSIVE MODE;
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "service_quotes" WHERE "line_format" IS NOT NULL)
       OR EXISTS (SELECT 1 FROM "service_quote_line_costs") THEN
      RAISE EXCEPTION 'Preserve new quote revisions and costs before rollback';
    END IF;
  END $$;
  DROP TABLE "service_quote_line_costs";
  ALTER TABLE "service_quotes" DROP COLUMN "line_format";`);
}
