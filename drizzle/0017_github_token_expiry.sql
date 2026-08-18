ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "github_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "github_expiry_reminder_14d_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "github_expiry_reminder_3d_sent_at" timestamp with time zone;
