CREATE TABLE IF NOT EXISTS "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"github_token_encrypted" text,
	"github_org" text,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_user_id_uidx" ON "user_settings" ("user_id");

-- Copy GitHub/sync columns from users when they still exist. Safe after those
-- columns have been dropped by drizzle-kit push.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'github_token_encrypted'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'sync_enabled'
  ) THEN
    EXECUTE $q$
      INSERT INTO "user_settings" (
        "user_id",
        "github_token_encrypted",
        "github_org",
        "sync_enabled"
      )
      SELECT
        "id",
        "github_token_encrypted",
        "github_org",
        COALESCE("sync_enabled", false)
      FROM "users"
      ON CONFLICT ("user_id") DO NOTHING
    $q$;
  ELSE
    EXECUTE $q$
      INSERT INTO "user_settings" ("user_id")
      SELECT "id" FROM "users"
      ON CONFLICT ("user_id") DO NOTHING
    $q$;
  END IF;
END $$;
