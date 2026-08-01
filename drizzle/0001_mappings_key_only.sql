DROP INDEX IF EXISTS "space_project_mappings_jira_space_id_uidx";--> statement-breakpoint
ALTER TABLE "space_project_mappings" DROP COLUMN IF EXISTS "jira_space_id";--> statement-breakpoint
ALTER TABLE "space_project_mappings" RENAME COLUMN "internal_project_id" TO "client_id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "space_project_mappings_jira_space_key_uidx" ON "space_project_mappings" USING btree ("jira_space_key");
