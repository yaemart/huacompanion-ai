import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
/** Data cutover is a separately authorized staff operation, never an implicit deployment side effect. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TYPE enum_crm_followup_slots_cutover_state AS ENUM ('managed','blocked');
    ALTER TABLE crm_followup_slots ADD COLUMN cutover_state enum_crm_followup_slots_cutover_state NOT NULL DEFAULT 'blocked';
    CREATE INDEX crm_followup_slots_cutover_idx ON crm_followup_slots(cutover_state,inquiry_id);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    LOCK TABLE crm_followup_slots,crm_followups IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM crm_followup_slots)
      OR EXISTS(SELECT 1 FROM crm_followups WHERE type='primary')
      THEN RAISE EXCEPTION 'Preserve primary followup cutover before rollback'; END IF; END $$;
    DROP INDEX crm_followup_slots_cutover_idx;
    ALTER TABLE crm_followup_slots DROP COLUMN cutover_state;
    DROP TYPE enum_crm_followup_slots_cutover_state;
  `);
}
