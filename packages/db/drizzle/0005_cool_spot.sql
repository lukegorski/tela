ALTER TABLE "users" ADD COLUMN "onboarding_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "body_info" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" jsonb;