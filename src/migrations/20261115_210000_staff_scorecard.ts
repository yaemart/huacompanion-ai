import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE scorecard_plans (
      id serial PRIMARY KEY,
      key varchar NOT NULL UNIQUE,
      effective_month varchar,
      revision numeric NOT NULL,
      configuration jsonb NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX scorecard_plans_effective_month_idx ON scorecard_plans(effective_month);
    CREATE INDEX scorecard_plans_updated_at_idx ON scorecard_plans(updated_at);
    CREATE INDEX scorecard_plans_created_at_idx ON scorecard_plans(created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE scorecard_plans IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM scorecard_plans) THEN
        RAISE EXCEPTION 'Preserve scorecard rules before rollback';
      END IF;
    END $$;
    DROP TABLE scorecard_plans;
  `);
}
