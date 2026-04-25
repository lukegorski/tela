ALTER TABLE "outfits" ADD COLUMN "name" varchar(120);--> statement-breakpoint
ALTER TABLE "outfits" ADD COLUMN "wardrobe_assessment" text;--> statement-breakpoint
ALTER TABLE "outfits" ADD COLUMN "saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outfits" ADD COLUMN "feedback" varchar(10);