CREATE TABLE IF NOT EXISTS "role_day_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_name" text NOT NULL,
	"role_key" text NOT NULL,
	"day_rate_cost" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_day_rates_role_key_uidx" ON "role_day_rates" USING btree ("role_key");
