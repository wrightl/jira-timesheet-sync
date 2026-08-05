ALTER TABLE "worklog_syncs" ADD COLUMN IF NOT EXISTS "author_account_id" text;--> statement-breakpoint
ALTER TABLE "worklog_syncs" ADD COLUMN IF NOT EXISTS "author_display_name" text;--> statement-breakpoint
ALTER TABLE "worklog_syncs" ADD COLUMN IF NOT EXISTS "app_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worklog_syncs" ADD CONSTRAINT "worklog_syncs_app_user_id_users_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worklog_syncs_app_user_id_created_at_idx" ON "worklog_syncs" USING btree ("app_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worklog_syncs_author_account_id_created_at_idx" ON "worklog_syncs" USING btree ("author_account_id","created_at");
