ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "github_token_encrypted" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "github_org" text;
