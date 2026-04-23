ALTER TABLE "item_photos" ADD COLUMN "enhancement_status" varchar(20);--> statement-breakpoint
ALTER TABLE "item_photos" ADD COLUMN "enhancement_error" varchar(500);--> statement-breakpoint
ALTER TABLE "item_photos" ADD COLUMN "enhancement_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_photos" ADD COLUMN "enhanced_storage_path" varchar(1024);--> statement-breakpoint
ALTER TABLE "item_photos" ADD COLUMN "background_color" varchar(7);--> statement-breakpoint
ALTER TABLE "item_photos" ADD COLUMN "enhanced_at" timestamp with time zone;