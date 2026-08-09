ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "jira_base_url" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "jira_email" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "jira_api_token_encrypted" text;

DO $$ BEGIN
  ALTER TYPE "api_cache_resource_type" ADD VALUE IF NOT EXISTS 'jira_search';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
