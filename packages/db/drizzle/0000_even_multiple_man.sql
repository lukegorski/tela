CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"type" varchar(100) NOT NULL,
	"source" varchar(20) NOT NULL,
	"context_snapshot" jsonb,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "annotated_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"outfit_description" text NOT NULL,
	"reasoning" text NOT NULL,
	"context" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closet_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"closet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"enhanced_photo_id" uuid,
	"background_color" varchar(7),
	"analysis_locale" varchar(10) DEFAULT 'en' NOT NULL,
	"category" varchar(100) NOT NULL,
	"subcategory" varchar(100),
	"primary_color" varchar(50) NOT NULL,
	"secondary_color" varchar(50),
	"pattern" varchar(50),
	"style" varchar(100),
	"fit" varchar(50),
	"length" varchar(50),
	"sleeve_length" varchar(50),
	"description" text,
	"formality_score" real DEFAULT 0.5 NOT NULL,
	"material_weight" varchar(10) DEFAULT 'medium' NOT NULL,
	"season_compatibility" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wear_count" integer DEFAULT 0 NOT NULL,
	"last_worn_at" timestamp with time zone,
	"embedding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"weather" jsonb,
	"time_of_day" varchar(20) NOT NULL,
	"season" varchar(10) NOT NULL,
	"occasion" varchar(50) NOT NULL,
	"calendar_context" text,
	"assembled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation" varchar(255) NOT NULL,
	"prompt_name" varchar(255) NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"raw_output" text NOT NULL,
	"parsed_output" jsonb,
	"latency_ms" real NOT NULL,
	"cost_cents" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_path" varchar(1024) NOT NULL,
	"width" integer,
	"height" integer,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outfit_id" uuid NOT NULL,
	"closet_item_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"generation_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"rationale" text NOT NULL,
	"pairing_key" varchar(255) NOT NULL,
	"embedding" jsonb,
	"saved" boolean DEFAULT false NOT NULL,
	"worn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"template" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changelog" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"latest_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "style_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_text" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"confidence" jsonb NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" varchar(500) NOT NULL,
	"triggered_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_text" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"confidence" jsonb NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latest_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "style_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "stylist_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(100) NOT NULL,
	"rule" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "try_on_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"outfit_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"avatar_url" varchar(1024),
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wardrobe_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"identified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closet_items" ADD CONSTRAINT "closet_items_closet_id_closets_id_fk" FOREIGN KEY ("closet_id") REFERENCES "public"."closets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closet_items" ADD CONSTRAINT "closet_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closet_items" ADD CONSTRAINT "closet_items_photo_id_item_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."item_photos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closet_items" ADD CONSTRAINT "closet_items_enhanced_photo_id_item_photos_id_fk" FOREIGN KEY ("enhanced_photo_id") REFERENCES "public"."item_photos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closets" ADD CONSTRAINT "closets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contexts" ADD CONSTRAINT "contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_photos" ADD CONSTRAINT "item_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_closet_item_id_closet_items_id_fk" FOREIGN KEY ("closet_item_id") REFERENCES "public"."closet_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_profile_versions" ADD CONSTRAINT "style_profile_versions_profile_id_style_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."style_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_profile_versions" ADD CONSTRAINT "style_profile_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD CONSTRAINT "try_on_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD CONSTRAINT "try_on_jobs_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wardrobe_gaps" ADD CONSTRAINT "wardrobe_gaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_user_id_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_timestamp_idx" ON "events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_user_type_idx" ON "events" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "closet_items_user_id_idx" ON "closet_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "closet_items_closet_id_idx" ON "closet_items" USING btree ("closet_id");--> statement-breakpoint
CREATE INDEX "closet_items_category_idx" ON "closet_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "generations_user_id_idx" ON "generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generations_operation_idx" ON "generations" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "outfits_user_id_idx" ON "outfits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outfits_pairing_key_idx" ON "outfits" USING btree ("pairing_key");