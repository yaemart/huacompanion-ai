import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_subscription_campaign_checks_kind AS ENUM ('mock-test','mock-confirm','mock-reset');
    CREATE TABLE subscription_campaign_checks (
      id serial PRIMARY KEY,
      draft_id integer NOT NULL REFERENCES subscription_campaign_drafts(id) ON DELETE RESTRICT,
      kind enum_subscription_campaign_checks_kind NOT NULL,
      binding varchar(64) NOT NULL,
      context_hash varchar(64) NOT NULL,
      actor_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      languages jsonb NOT NULL,
      test_id integer REFERENCES subscription_campaign_checks(id) ON DELETE RESTRICT,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX subscription_campaign_checks_draft_kind_binding_idx ON subscription_campaign_checks(draft_id,kind,binding);
    CREATE INDEX subscription_campaign_checks_draft_idx ON subscription_campaign_checks(draft_id);
    CREATE INDEX subscription_campaign_checks_actor_idx ON subscription_campaign_checks(actor_id);
    CREATE INDEX subscription_campaign_checks_test_idx ON subscription_campaign_checks(test_id);
    CREATE INDEX subscription_campaign_checks_updated_at_idx ON subscription_campaign_checks(updated_at);
    CREATE INDEX subscription_campaign_checks_created_at_idx ON subscription_campaign_checks(created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscription_campaign_checks IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscription_campaign_checks) THEN
        RAISE EXCEPTION 'Preserve campaign checks before rollback';
      END IF;
    END $$;
    DROP TABLE subscription_campaign_checks;
    DROP TYPE enum_subscription_campaign_checks_kind;
  `);
}
