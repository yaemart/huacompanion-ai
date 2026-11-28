import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_crm_followups_anchor_kind AS ENUM ('client','inquiry');
    CREATE TYPE enum_crm_followups_type AS ENUM ('primary','adhoc');
    CREATE TYPE enum_crm_followups_state AS ENUM ('pending','completed','canceled');
    CREATE TABLE crm_followups (
      id serial PRIMARY KEY, reference varchar(40) NOT NULL UNIQUE,
      anchor_kind enum_crm_followups_anchor_kind NOT NULL,
      client_id integer REFERENCES crm_clients(id) ON DELETE RESTRICT,
      inquiry_id integer REFERENCES inquiries(id) ON DELETE RESTRICT,
      type enum_crm_followups_type NOT NULL, title varchar(200) NOT NULL CHECK(length(trim(title))>0),
      description varchar(2000), assignee_id integer REFERENCES staff(id) ON DELETE RESTRICT,
      due_at timestamptz(3) NOT NULL CHECK(isfinite(due_at)), state enum_crm_followups_state NOT NULL,
      needs_review boolean NOT NULL DEFAULT false,
      revision numeric NOT NULL CHECK(revision>=1 AND revision=trunc(revision)),
      created_by_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      terminal_by_id integer REFERENCES staff(id) ON DELETE RESTRICT, terminal_at timestamptz(3),
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now(),
      CHECK ((anchor_kind='client' AND client_id IS NOT NULL AND inquiry_id IS NULL AND type='adhoc')
          OR (anchor_kind='inquiry' AND inquiry_id IS NOT NULL AND client_id IS NULL)),
      CHECK ((state='pending' AND terminal_at IS NULL AND terminal_by_id IS NULL)
          OR (state<>'pending' AND terminal_at IS NOT NULL AND isfinite(terminal_at) AND terminal_by_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX crm_followups_primary_pending_idx ON crm_followups(inquiry_id) WHERE type='primary' AND state='pending';
    CREATE INDEX crm_followups_client_due_idx ON crm_followups(client_id,due_at,id) WHERE state='pending';
    CREATE INDEX crm_followups_inquiry_due_idx ON crm_followups(inquiry_id,due_at,id) WHERE state='pending';
    CREATE INDEX crm_followups_assignee_due_idx ON crm_followups(assignee_id,due_at,id) WHERE state='pending';
    CREATE INDEX crm_followups_created_at_idx ON crm_followups(created_at);
    CREATE INDEX crm_followups_updated_at_idx ON crm_followups(updated_at);
    CREATE TABLE crm_followup_events (
      id serial PRIMARY KEY, task_id integer NOT NULL REFERENCES crm_followups(id) ON DELETE RESTRICT,
      seq numeric NOT NULL CHECK(seq>=1 AND seq=trunc(seq)), action varchar(40) NOT NULL,
      actor_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      server_time timestamptz(3) NOT NULL CHECK(isfinite(server_time)), details jsonb NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now(),
      UNIQUE(task_id,seq)
    );
    CREATE INDEX crm_followup_events_created_at_idx ON crm_followup_events(created_at);
    CREATE INDEX crm_followup_events_updated_at_idx ON crm_followup_events(updated_at);
    CREATE TABLE crm_followup_slots (
      id serial PRIMARY KEY, inquiry_id integer NOT NULL UNIQUE REFERENCES inquiries(id) ON DELETE RESTRICT,
      source_key varchar(80) NOT NULL UNIQUE,
      generation numeric NOT NULL CHECK(generation>=1 AND generation=trunc(generation)),
      revision numeric NOT NULL CHECK(revision>=1 AND revision=trunc(revision)),
      current_task_id integer REFERENCES crm_followups(id) ON DELETE RESTRICT, provenance jsonb NOT NULL,
      updated_at timestamptz(3) NOT NULL DEFAULT now(), created_at timestamptz(3) NOT NULL DEFAULT now(),
      CHECK(source_key='legacy-inquiry:' || inquiry_id::text)
    );
    CREATE INDEX crm_followup_slots_created_at_idx ON crm_followup_slots(created_at);
    CREATE INDEX crm_followup_slots_updated_at_idx ON crm_followup_slots(updated_at);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE crm_followups,crm_followup_events,crm_followup_slots IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM crm_followups) OR EXISTS(SELECT 1 FROM crm_followup_events)
      OR EXISTS(SELECT 1 FROM crm_followup_slots) OR EXISTS(SELECT 1 FROM crm_operations WHERE action LIKE '%Followup%')
      THEN RAISE EXCEPTION 'Preserve CRM followup history before rollback'; END IF; END $$;
    DROP TABLE crm_followup_slots; DROP TABLE crm_followup_events; DROP TABLE crm_followups;
    DROP TYPE enum_crm_followups_state; DROP TYPE enum_crm_followups_type; DROP TYPE enum_crm_followups_anchor_kind;
  `);
}
