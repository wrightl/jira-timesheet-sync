ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'exec';
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "slack_webhook_url_encrypted" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "alert_email" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "alert_thresholds_json" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oauth_provider" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oauth_subject" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_oauth_provider_subject_uidx"
  ON "users" ("oauth_provider", "oauth_subject");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_name_uidx" ON "teams" ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_mapping_id" uuid REFERENCES "user_mappings"("id") ON DELETE set null,
  "app_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "display_name" text,
  "weekly_capacity_hours" text DEFAULT '40',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_team_id_idx" ON "team_members" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_app_user_id_idx" ON "team_members" ("app_user_id");
