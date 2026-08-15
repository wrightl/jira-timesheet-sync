-- Phase 2: team → client/project ownership for portfolio + alert routing
CREATE TABLE IF NOT EXISTS "team_ownerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text,
	"project_id" text DEFAULT '' NOT NULL,
	"project_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_ownerships" ADD CONSTRAINT "team_ownerships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_ownerships_team_client_project_uidx" ON "team_ownerships" USING btree ("team_id","client_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_ownerships_team_id_idx" ON "team_ownerships" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_ownerships_client_id_idx" ON "team_ownerships" USING btree ("client_id");
