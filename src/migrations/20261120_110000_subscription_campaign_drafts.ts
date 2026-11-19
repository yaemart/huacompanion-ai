import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_subscription_campaign_drafts_topic AS ENUM ('policy-updates');
    CREATE TABLE subscription_campaign_drafts (
      id serial PRIMARY KEY,
      campaign_key varchar NOT NULL,
      owner_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      topic enum_subscription_campaign_drafts_topic NOT NULL,
      revision numeric NOT NULL CHECK (revision >= 1 AND revision = trunc(revision)),
      selections jsonb NOT NULL,
      preview jsonb NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX subscription_campaign_drafts_campaign_key_revision_idx
      ON subscription_campaign_drafts(campaign_key, revision);
    CREATE INDEX subscription_campaign_drafts_campaign_key_idx ON subscription_campaign_drafts(campaign_key);
    CREATE INDEX subscription_campaign_drafts_owner_idx ON subscription_campaign_drafts(owner_id);
    CREATE INDEX subscription_campaign_drafts_updated_at_idx ON subscription_campaign_drafts(updated_at);
    CREATE INDEX subscription_campaign_drafts_created_at_idx ON subscription_campaign_drafts(created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_drafts IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_drafts) THEN
        RAISE EXCEPTION 'Preserve campaign drafts before rollback';
      END IF;
    END $$;
    DROP TABLE subscription_campaign_drafts;
    DROP TYPE enum_subscription_campaign_drafts_topic;
  `);
}
