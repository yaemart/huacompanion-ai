import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   ALTER TABLE "content_drafts" ADD COLUMN "contributors" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "_content_drafts_v" ADD COLUMN "version_contributors" jsonb DEFAULT '[]'::jsonb;`)
  await db.execute(`
    UPDATE content_drafts d SET contributors = coalesce((
      SELECT jsonb_agg(DISTINCT id) FROM (
        SELECT d.last_edited_by AS id UNION SELECT d.submitted_by
        UNION SELECT v.version_last_edited_by FROM _content_drafts_v v WHERE v.parent_id=d.id
        UNION SELECT v.version_submitted_by FROM _content_drafts_v v WHERE v.parent_id=d.id
      ) authors WHERE id IS NOT NULL
    ), '[]'::jsonb);
  `);
}


export async function down(_args:MigrateDownArgs):Promise<void>{throw new Error("Contributor history must be preserved; review before rollback.");}
