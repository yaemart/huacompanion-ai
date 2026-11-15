import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_performance_incidents_source AS ENUM ('case', 'content', 'fact', 'note');
    CREATE TYPE enum_performance_incidents_state AS ENUM ('pending', 'confirmed', 'dismissed');
    CREATE TYPE enum_performance_incidents_responsibility AS ENUM ('company', 'supplier', 'unassigned');
    CREATE TYPE enum_performance_findings_duty AS ENUM ('service', 'editing', 'verification', 'review');
    CREATE TYPE enum_performance_findings_result AS ENUM ('upheld', 'changed', 'dismissed');
    CREATE TABLE performance_incidents (
      id serial PRIMARY KEY,
      key varchar NOT NULL UNIQUE,
      source enum_performance_incidents_source NOT NULL,
      source_record numeric NOT NULL,
      source_version numeric NOT NULL,
      source_revision numeric,
      source_locale varchar,
      issue_field varchar,
      title varchar NOT NULL,
      evidence varchar NOT NULL,
      occurred_at timestamptz(3) NOT NULL,
      reported_by numeric NOT NULL,
      participants jsonb NOT NULL,
      source_team numeric,
      complete_history boolean NOT NULL DEFAULT false,
      related_incident numeric,
      duplicate_of numeric,
      state enum_performance_incidents_state NOT NULL,
      responsibility enum_performance_incidents_responsibility,
      decided_by numeric,
      first_confirmed_at timestamptz(3),
      decision_reason varchar,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now()
    );
    CREATE INDEX performance_incidents_reported_by_idx ON performance_incidents(reported_by);
    CREATE INDEX performance_incidents_updated_at_idx ON performance_incidents(updated_at);
    CREATE INDEX performance_incidents_created_at_idx ON performance_incidents(created_at);
    CREATE TABLE performance_findings (
      id serial PRIMARY KEY,
      incident_id integer NOT NULL REFERENCES performance_incidents(id) ON DELETE RESTRICT,
      staff_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
      duty enum_performance_findings_duty NOT NULL,
      summary varchar NOT NULL,
      active boolean NOT NULL DEFAULT true,
      notified_at timestamptz(3) NOT NULL,
      appeal_at timestamptz(3),
      appeal_reason varchar,
      result enum_performance_findings_result,
      resolved_at timestamptz(3),
      resolved_by numeric,
      resolution varchar,
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      created_at timestamptz(3) NOT NULL DEFAULT now(),
      UNIQUE (incident_id, staff_id)
    );
    CREATE INDEX performance_findings_incident_idx ON performance_findings(incident_id);
    CREATE INDEX performance_findings_staff_idx ON performance_findings(staff_id);
    CREATE INDEX performance_findings_updated_at_idx ON performance_findings(updated_at);
    CREATE INDEX performance_findings_created_at_idx ON performance_findings(created_at);
    ALTER TABLE content_events ADD COLUMN publication_participants jsonb;
    ALTER TABLE workflow_notifications ADD COLUMN performance_incident numeric;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE performance_incidents, performance_findings, content_events, workflow_notifications IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM performance_incidents)
        OR EXISTS (SELECT 1 FROM content_events WHERE publication_participants IS NOT NULL)
        OR EXISTS (SELECT 1 FROM workflow_notifications WHERE performance_incident IS NOT NULL) THEN
        RAISE EXCEPTION 'Preserve performance records and publication evidence before rollback';
      END IF;
    END $$;
    ALTER TABLE workflow_notifications DROP COLUMN performance_incident;
    ALTER TABLE content_events DROP COLUMN publication_participants;
    DROP TABLE performance_findings;
    DROP TABLE performance_incidents;
    DROP TYPE enum_performance_findings_result;
    DROP TYPE enum_performance_findings_duty;
    DROP TYPE enum_performance_incidents_responsibility;
    DROP TYPE enum_performance_incidents_state;
    DROP TYPE enum_performance_incidents_source;
  `);
}
