ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_set_password" boolean DEFAULT false NOT NULL;
