import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`CREATE TABLE local_mail_dispatch (
    id serial PRIMARY KEY, key varchar NOT NULL UNIQUE, owner varchar,
    next_at timestamptz(3) NOT NULL, updated_at timestamptz(3) NOT NULL DEFAULT now(),
    created_at timestamptz(3) NOT NULL DEFAULT now()
  );
  CREATE INDEX local_mail_dispatch_updated_at_idx ON local_mail_dispatch(updated_at);
  CREATE INDEX local_mail_dispatch_created_at_idx ON local_mail_dispatch(created_at);`);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`LOCK TABLE local_mail_dispatch IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM local_mail_dispatch)
      THEN RAISE EXCEPTION 'Preserve dispatch state before rollback'; END IF; END $$;
    DROP TABLE local_mail_dispatch;`);
}
