import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_crm_clients_kind AS ENUM ('individual','company');
    CREATE TYPE enum_crm_clients_language AS ENUM ('en','zh');
    CREATE TYPE enum_crm_clients_status AS ENUM ('active','archived');
    CREATE TYPE enum_crm_contacts_status AS ENUM ('active','archived');
    CREATE TABLE crm_clients (
      id serial PRIMARY KEY, reference varchar(40) NOT NULL UNIQUE,
      kind enum_crm_clients_kind NOT NULL, display_name varchar(200) NOT NULL,
      language enum_crm_clients_language NOT NULL, country_code varchar(2),
      team_id integer NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      owner_id integer REFERENCES staff(id) ON DELETE RESTRICT,
      status enum_crm_clients_status NOT NULL, revision numeric NOT NULL CHECK (revision>=1),
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX crm_clients_scope_idx ON crm_clients(team_id,owner_id,status);
    CREATE INDEX crm_clients_created_at_idx ON crm_clients(created_at);
    CREATE INDEX crm_clients_updated_at_idx ON crm_clients(updated_at);
    CREATE TABLE crm_contacts (
      id serial PRIMARY KEY, client_id integer NOT NULL REFERENCES crm_clients(id) ON DELETE RESTRICT,
      name varchar(200) NOT NULL, email varchar(254), phone varchar(100), job_title varchar(100),
      is_primary boolean NOT NULL DEFAULT false, status enum_crm_contacts_status NOT NULL,
      revision numeric NOT NULL CHECK (revision>=1), updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now(),
      CHECK (coalesce(email,'')<>'' OR coalesce(phone,'')<>'')
    );
    CREATE UNIQUE INDEX crm_contacts_primary_idx ON crm_contacts(client_id) WHERE is_primary AND status='active';
    CREATE INDEX crm_contacts_client_idx ON crm_contacts(client_id,status);
    CREATE INDEX crm_contacts_created_at_idx ON crm_contacts(created_at);
    CREATE INDEX crm_contacts_updated_at_idx ON crm_contacts(updated_at);
    CREATE TABLE crm_operations (
      id serial PRIMARY KEY, actor_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      key varchar(80) NOT NULL UNIQUE, operation_key varchar(36) NOT NULL,
      action varchar(32) NOT NULL, input_digest varchar(64) NOT NULL, epoch varchar(64) NOT NULL, result jsonb NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now(),
      UNIQUE(actor_id,operation_key)
    );
    CREATE INDEX crm_operations_created_at_idx ON crm_operations(created_at);
    CREATE INDEX crm_operations_updated_at_idx ON crm_operations(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE crm_clients,crm_contacts,crm_operations IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM crm_clients) OR EXISTS(SELECT 1 FROM crm_contacts)
      OR EXISTS(SELECT 1 FROM crm_operations) THEN RAISE EXCEPTION 'Preserve CRM data before rollback'; END IF; END $$;
    DROP TABLE crm_operations; DROP TABLE crm_contacts; DROP TABLE crm_clients;
    DROP TYPE enum_crm_contacts_status; DROP TYPE enum_crm_clients_status;
    DROP TYPE enum_crm_clients_language; DROP TYPE enum_crm_clients_kind;
  `);
}
