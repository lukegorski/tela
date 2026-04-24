ALTER TABLE "try_on_jobs" ADD COLUMN "status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "model_image_url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "async_job_id" varchar(128);--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "async_step" varchar(20);--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "intermediate_image_url" text;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "result_storage_path" text;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "try_on_jobs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "try_on_jobs_user_id_idx" ON "try_on_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "try_on_jobs_outfit_id_idx" ON "try_on_jobs" USING btree ("outfit_id");--> statement-breakpoint
CREATE INDEX "try_on_jobs_status_idx" ON "try_on_jobs" USING btree ("status");