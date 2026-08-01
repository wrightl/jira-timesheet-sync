CREATE TYPE "public"."sync_status" AS ENUM('synced', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_event_type" AS ENUM('worklog_created', 'worklog_updated', 'worklog_deleted');--> statement-breakpoint
CREATE TABLE "space_project_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jira_space_key" text NOT NULL,
	"client_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"internal_pm_access_token_encrypted" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worklog_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jira_worklog_id" text NOT NULL,
	"jira_issue_key" text,
	"jira_space_id" text,
	"event_type" "sync_event_type" NOT NULL,
	"internal_timesheet_id" text,
	"status" "sync_status" NOT NULL,
	"payload_hash" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "space_project_mappings_jira_space_key_uidx" ON "space_project_mappings" USING btree ("jira_space_key");--> statement-breakpoint
CREATE UNIQUE INDEX "worklog_syncs_worklog_event_hash_uidx" ON "worklog_syncs" USING btree ("jira_worklog_id","event_type","payload_hash");--> statement-breakpoint
CREATE INDEX "worklog_syncs_jira_worklog_id_idx" ON "worklog_syncs" USING btree ("jira_worklog_id");--> statement-breakpoint
CREATE INDEX "worklog_syncs_created_at_idx" ON "worklog_syncs" USING btree ("created_at");
