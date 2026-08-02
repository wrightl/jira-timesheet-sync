ALTER TYPE "public"."sync_status" ADD VALUE IF NOT EXISTS 'pending';--> statement-breakpoint
ALTER TABLE "worklog_syncs" ADD COLUMN IF NOT EXISTS "raw_payload" text;
