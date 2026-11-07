import { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(`
   CREATE TABLE "support_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"text_chat" boolean DEFAULT true,
  	"ai_reception" boolean DEFAULT false,
  	"voice_messages" boolean DEFAULT false,
  	"transcription" boolean DEFAULT false,
  	"translation" boolean DEFAULT false,
  	"speech_playback" boolean DEFAULT false,
  	"ai_calls" boolean DEFAULT false,
  	"human_calls" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  `);
}

export async function down(): Promise<void> {
  throw new Error("Settings rollback requires a backup plan");
}
