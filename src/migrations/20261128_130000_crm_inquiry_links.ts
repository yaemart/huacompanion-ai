import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE crm_inquiry_links (
      id serial PRIMARY KEY,
      client_id integer NOT NULL REFERENCES crm_clients(id) ON DELETE RESTRICT,
      inquiry_id integer NOT NULL UNIQUE REFERENCES inquiries(id) ON DELETE RESTRICT,
      active boolean NOT NULL, revision numeric NOT NULL CHECK(revision>=1),
      linked_by_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      linked_at timestamptz(3) NOT NULL, reason varchar(2000) NOT NULL,
      revoked_by_id integer REFERENCES staff(id) ON DELETE RESTRICT,
      revoked_at timestamptz(3), revocation_reason varchar(2000),
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX crm_inquiry_links_client_idx ON crm_inquiry_links(client_id,active);
    CREATE INDEX crm_inquiry_links_created_at_idx ON crm_inquiry_links(created_at);
    CREATE INDEX crm_inquiry_links_updated_at_idx ON crm_inquiry_links(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE crm_inquiry_links IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM crm_inquiry_links)
      THEN RAISE EXCEPTION 'Preserve CRM inquiry association history before rollback'; END IF; END $$;
    DROP TABLE crm_inquiry_links;
  `);
}
