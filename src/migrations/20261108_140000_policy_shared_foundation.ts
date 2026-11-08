import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
const tables = [
  "policy_groups",
  "policy_fact_drafts",
  "policy_fact_versions",
  "policy_note_drafts",
  "policy_note_versions",
];
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_policy_fact_drafts_review_state AS ENUM ('draft','review','returned','approved');
    CREATE TYPE enum_policy_note_drafts_review_state AS ENUM ('draft','review','returned','approved');
    CREATE TABLE policy_groups (
      id serial PRIMARY KEY, content_key varchar NOT NULL, revision numeric NOT NULL DEFAULT 1,
      active_fact_version_id integer,
      updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE policy_fact_drafts (
      id serial PRIMARY KEY, group_id integer NOT NULL, revision numeric NOT NULL DEFAULT 1, facts jsonb NOT NULL,
      review_state enum_policy_fact_drafts_review_state NOT NULL DEFAULT 'draft', contributors jsonb DEFAULT '[]',
      last_edited_by numeric, submitted_by numeric, review_note varchar,
      updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE policy_fact_versions (
      id serial PRIMARY KEY, group_id integer NOT NULL, revision numeric NOT NULL DEFAULT 1, facts jsonb NOT NULL,
      source_revision numeric NOT NULL, approved_by numeric NOT NULL, contributors jsonb NOT NULL, override_reason varchar,
      updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE policy_note_drafts (
      id serial PRIMARY KEY, group_id integer NOT NULL, locale varchar NOT NULL, revision numeric NOT NULL DEFAULT 1,
      title varchar NOT NULL, slug varchar NOT NULL, public_notes varchar, based_on_fact_version_id integer,
      published_note_version_id integer, needs_review boolean NOT NULL DEFAULT true,
      review_state enum_policy_note_drafts_review_state NOT NULL DEFAULT 'draft', contributors jsonb DEFAULT '[]',
      last_edited_by numeric, submitted_by numeric, review_note varchar,
      updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE policy_note_versions (
      id serial PRIMARY KEY, group_id integer NOT NULL, locale varchar NOT NULL, revision numeric NOT NULL DEFAULT 1,
      title varchar NOT NULL, slug varchar NOT NULL, public_notes varchar, based_on_fact_version_id integer NOT NULL,
      source_revision numeric NOT NULL, approved_by numeric NOT NULL, contributors jsonb NOT NULL, override_reason varchar,
      updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX policy_groups_content_key_idx ON policy_groups(content_key);
    CREATE UNIQUE INDEX group_idx ON policy_fact_drafts(group_id);
    CREATE UNIQUE INDEX group_revision_idx ON policy_fact_versions(group_id,revision);
    CREATE UNIQUE INDEX group_locale_idx ON policy_note_drafts(group_id,locale);
    CREATE UNIQUE INDEX locale_slug_idx ON policy_note_drafts(locale,slug);
    CREATE UNIQUE INDEX group_locale_revision_idx ON policy_note_versions(group_id,locale,revision);
    CREATE FUNCTION policy_shared_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'Immutable policy versions cannot be updated or deleted';
    END $$;
    CREATE FUNCTION policy_shared_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.revision < 1 OR NEW.revision <> trunc(NEW.revision) THEN
        RAISE EXCEPTION 'Policy revision must be a positive integer';
      END IF;
      IF TG_TABLE_NAME IN ('policy_note_drafts','policy_note_versions') THEN
        IF NEW.locale NOT IN ('en','zh') THEN RAISE EXCEPTION 'Policy locale must be en or zh'; END IF;
        IF NEW.based_on_fact_version_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM policy_fact_versions WHERE id=NEW.based_on_fact_version_id AND group_id=NEW.group_id
        ) THEN RAISE EXCEPTION 'Fact version must belong to the same policy group'; END IF;
      END IF;
      IF TG_TABLE_NAME='policy_groups' THEN
        IF NEW.active_fact_version_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM policy_fact_versions WHERE id=NEW.active_fact_version_id AND group_id=NEW.id
        ) THEN RAISE EXCEPTION 'Active fact version must belong to the same policy group'; END IF;
      END IF;
      IF TG_TABLE_NAME='policy_note_drafts' THEN
        IF NEW.published_note_version_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM policy_note_versions WHERE id=NEW.published_note_version_id
            AND group_id=NEW.group_id AND locale=NEW.locale
        ) THEN RAISE EXCEPTION 'Note version must belong to the same policy group and locale'; END IF;
      END IF;
      IF TG_TABLE_NAME IN ('policy_fact_versions','policy_note_versions') THEN
        IF NEW.source_revision < 1 OR NEW.source_revision <> trunc(NEW.source_revision)
          OR NEW.approved_by < 1 OR NEW.approved_by <> trunc(NEW.approved_by) THEN
          RAISE EXCEPTION 'Approval metadata must contain positive integers';
        END IF;
      END IF;
      RETURN NEW;
    END $$;
  `);
  for (const table of tables) {
    await db.execute(`
      CREATE INDEX ${table}_updated_at_idx ON ${table}(updated_at);
      CREATE INDEX ${table}_created_at_idx ON ${table}(created_at);
      CREATE TRIGGER policy_shared_guard BEFORE INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION policy_shared_guard();
      ALTER TABLE payload_locked_documents_rels ADD COLUMN ${table}_id integer;
      ALTER TABLE payload_locked_documents_rels ADD CONSTRAINT payload_locked_documents_rels_${table}_fk FOREIGN KEY (${table}_id) REFERENCES ${table}(id) ON DELETE cascade;
      CREATE INDEX payload_locked_documents_rels_${table}_id_idx ON payload_locked_documents_rels(${table}_id);
    `);
  }
  const references = [
    ["policy_groups", "active_fact_version", "policy_fact_versions"],
    ["policy_fact_drafts", "group", "policy_groups"],
    ["policy_fact_versions", "group", "policy_groups"],
    ["policy_note_drafts", "group", "policy_groups"],
    ["policy_note_drafts", "based_on_fact_version", "policy_fact_versions"],
    ["policy_note_drafts", "published_note_version", "policy_note_versions"],
    ["policy_note_versions", "group", "policy_groups"],
    ["policy_note_versions", "based_on_fact_version", "policy_fact_versions"],
  ];
  for (const [table, field, target] of references) {
    await db.execute(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_${field}_id_${target}_id_fk FOREIGN KEY (${field}_id) REFERENCES ${target}(id) ON DELETE set null;
      CREATE INDEX ${table}_${field}_idx ON ${table}(${field}_id);`);
  }
  for (const table of ["policy_fact_versions", "policy_note_versions"]) {
    await db.execute(`CREATE TRIGGER policy_shared_immutable BEFORE UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION policy_shared_immutable();`);
  }
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM policy_groups) OR EXISTS (SELECT 1 FROM policy_fact_drafts)
      OR EXISTS (SELECT 1 FROM policy_fact_versions) OR EXISTS (SELECT 1 FROM policy_note_drafts)
      OR EXISTS (SELECT 1 FROM policy_note_versions) THEN
      RAISE EXCEPTION 'Preserve shared policy data before rollback; refusing data loss';
    END IF;
    END $$;`);
  for (const table of tables)
    await db.execute(`ALTER TABLE payload_locked_documents_rels DROP COLUMN ${table}_id;`);
  await db.execute(`
    ALTER TABLE policy_groups DROP CONSTRAINT policy_groups_active_fact_version_id_policy_fact_versions_id_fk;
    DROP TABLE policy_note_drafts;
    DROP TABLE policy_note_versions;
    DROP TABLE policy_fact_drafts;
    DROP TABLE policy_fact_versions;
    DROP TABLE policy_groups;
    DROP FUNCTION policy_shared_guard();
    DROP FUNCTION policy_shared_immutable();
    DROP TYPE enum_policy_fact_drafts_review_state;
    DROP TYPE enum_policy_note_drafts_review_state;
  `);
}
