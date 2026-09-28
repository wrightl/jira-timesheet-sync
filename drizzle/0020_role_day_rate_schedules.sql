DROP TABLE IF EXISTS "role_day_rates";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_day_rate_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_month" text NOT NULL,
	"rates_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_day_rate_schedules_month_uidx" ON "role_day_rate_schedules" USING btree ("effective_month");
