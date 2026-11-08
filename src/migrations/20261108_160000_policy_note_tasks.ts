import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`ALTER TABLE workflow_tasks ADD COLUMN policy_group_id integer;
    ALTER TABLE workflow_tasks ADD CONSTRAINT workflow_tasks_policy_group_id_policy_groups_id_fk
      FOREIGN KEY (policy_group_id) REFERENCES policy_groups(id) ON DELETE set null;
    CREATE INDEX workflow_tasks_policy_group_idx ON workflow_tasks(policy_group_id);`);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM workflow_tasks WHERE policy_group_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Preserve policy note task data before rollback; refusing data loss';
    END IF;
    END $$;
    DROP INDEX workflow_tasks_policy_group_idx;
    ALTER TABLE workflow_tasks DROP CONSTRAINT workflow_tasks_policy_group_id_policy_groups_id_fk;
    ALTER TABLE workflow_tasks DROP COLUMN policy_group_id;`);
}
