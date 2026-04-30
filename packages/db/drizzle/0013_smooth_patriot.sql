CREATE TABLE "migration_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"legacy_entity_type" varchar(50) NOT NULL,
	"legacy_id" varchar(255) NOT NULL,
	"reason" text NOT NULL,
	"attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"legacy_entity_type" varchar(50) NOT NULL,
	"legacy_id" varchar(255) NOT NULL,
	"new_entity_type" varchar(50) NOT NULL,
	"new_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_log_user_entity_legacy_uniq" UNIQUE("user_id","legacy_entity_type","legacy_id")
);
--> statement-breakpoint
ALTER TABLE "migration_failures" ADD CONSTRAINT "migration_failures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_log" ADD CONSTRAINT "migration_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "migration_failures_user_id_idx" ON "migration_failures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "migration_log_user_id_idx" ON "migration_log" USING btree ("user_id");