import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_subscriptions_locale AS ENUM ('zh', 'en', 'es', 'fr', 'de', 'it', 'ar');
    CREATE TYPE enum_subscriptions_status AS ENUM ('pending', 'confirmed', 'unsubscribed');
    CREATE TYPE enum_subscription_credentials_purpose AS ENUM ('confirm', 'unsubscribe');
    CREATE TABLE subscriptions (
      id serial PRIMARY KEY,
      email varchar NOT NULL,
      topic varchar NOT NULL,
      locale enum_subscriptions_locale NOT NULL,
      status enum_subscriptions_status NOT NULL DEFAULT 'pending',
      consent_version numeric NOT NULL,
      consented_at timestamptz(3) NOT NULL,
      privacy_version varchar NOT NULL,
      source_path varchar NOT NULL,
      partner_code varchar,
      confirmed_at timestamptz(3),
      unsubscribed_at timestamptz(3),
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX email_topic_idx ON subscriptions(email, topic);
    CREATE INDEX subscriptions_updated_at_idx ON subscriptions(updated_at);
    CREATE INDEX subscriptions_created_at_idx ON subscriptions(created_at);
    CREATE TABLE subscription_credentials (
      id serial PRIMARY KEY,
      subscription_id integer NOT NULL,
      purpose enum_subscription_credentials_purpose NOT NULL,
      token_hash varchar NOT NULL,
      version numeric NOT NULL,
      expires_at timestamptz(3) NOT NULL,
      consumed_at timestamptz(3),
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT subscription_credentials_subscription_id_subscriptions_id_fk
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX subscription_credentials_token_hash_idx ON subscription_credentials(token_hash);
    CREATE INDEX subscription_credentials_subscription_idx ON subscription_credentials(subscription_id);
    CREATE INDEX subscription_credentials_updated_at_idx ON subscription_credentials(updated_at);
    CREATE INDEX subscription_credentials_created_at_idx ON subscription_credentials(created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE subscriptions, subscription_credentials IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM subscriptions) OR EXISTS (SELECT 1 FROM subscription_credentials) THEN
        RAISE EXCEPTION 'Preserve subscription records before rollback';
      END IF;
    END $$;
    DROP TABLE subscription_credentials;
    DROP TABLE subscriptions;
    DROP TYPE enum_subscription_credentials_purpose;
    DROP TYPE enum_subscriptions_status;
    DROP TYPE enum_subscriptions_locale;
  `);
}
