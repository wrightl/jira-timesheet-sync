CREATE TYPE "public"."api_cache_resource_type" AS ENUM('projects', 'project_budgets');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jira_display_name" text NOT NULL,
	"jira_account_id" text,
	"bitmap_user_id" text NOT NULL,
	"bitmap_email" text,
	"job_title" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"resource_type" "api_cache_resource_type" NOT NULL,
	"request_meta" text NOT NULL,
	"response_body" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_mappings_jira_display_name_uidx" ON "user_mappings" USING btree ("jira_display_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_cache_cache_key_uidx" ON "api_cache" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_cache_expires_at_idx" ON "api_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_cache_resource_type_idx" ON "api_cache" USING btree ("resource_type");
