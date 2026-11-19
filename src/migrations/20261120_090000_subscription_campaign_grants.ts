import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_subscription_campaign_grants_topic AS ENUM ('policy-updates');
    CREATE TABLE subscription_campaign_grants (
      id serial PRIMARY KEY,
      staff_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      topic enum_subscription_campaign_grants_topic NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      revision numeric NOT NULL DEFAULT 1 CHECK (revision >= 1 AND revision = trunc(revision)),
      changed_by_id integer REFERENCES staff(id) ON DELETE SET NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX subscription_campaign_grants_staff_topic_idx
      ON subscription_campaign_grants(staff_id, topic);
    CREATE INDEX subscription_campaign_grants_staff_idx ON subscription_campaign_grants(staff_id);
    CREATE INDEX subscription_campaign_grants_changed_by_idx ON subscription_campaign_grants(changed_by_id);
    CREATE INDEX subscription_campaign_grants_updated_at_idx ON subscription_campaign_grants(updated_at);
    CREATE INDEX subscription_campaign_grants_created_at_idx ON subscription_campaign_grants(created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_grants IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_grants) THEN
        RAISE EXCEPTION 'Preserve campaign grants before rollback';
      END IF;
    END $$;
    DROP TABLE subscription_campaign_grants;
    DROP TYPE enum_subscription_campaign_grants_topic;
  `);
}
