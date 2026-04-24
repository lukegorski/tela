ALTER TABLE "chat_conversations" ADD COLUMN "title" varchar(200);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "role" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "tool_calls" jsonb;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "generation_id" uuid;--> statement-breakpoint
CREATE INDEX "chat_conversations_user_id_idx" ON "chat_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");