ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sync_enabled" boolean DEFAULT true NOT NULL;
