CREATE TABLE "outfit_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outfit_drafts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "outfits" ALTER COLUMN "generation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outfits" ALTER COLUMN "context_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outfits" ALTER COLUMN "rationale" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "item_photos" ADD COLUMN "cutout_storage_path" varchar(1024);--> statement-breakpoint
ALTER TABLE "outfits" ADD COLUMN "source" varchar(10) DEFAULT 'ai' NOT NULL;--> statement-breakpoint
ALTER TABLE "outfits" ADD COLUMN "card_storage_path" varchar(1024);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "outfit_drafts" ADD CONSTRAINT "outfit_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;