/**
 * Tables for domains being filled out incrementally during Phase 8+.
 * Originally stubs; chat is now real (Phase 8.7), try_on + translations
 * still minimal until their respective phases.
 */
import { pgTable, uuid, timestamp, varchar, text, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { outfits } from './outfits.js';

// ─── Chat (Phase 8.7) ───

export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Optional human-readable title (auto-generated from the first user message) */
    title: varchar('title', { length: 200 }),
    /** Number of messages — denormalized for cheap list queries */
    messageCount: integer('message_count').notNull().default(0),
    /** Last assistant or user message timestamp — for sorting conversations */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chat_conversations_user_id_idx').on(table.userId)],
);

/**
 * One tool invocation made by the assistant during a chat turn.
 *
 * Stored as jsonb on chat_messages.tool_calls when role='assistant'. Captures
 * enough to render the activity in the UI ("generated 3 outfits", "looked
 * up the floral capris") and to debug failed turns. The full tool result
 * payload is NOT stored here — it lives in the generations row referenced
 * by the message's generationId, which keeps chat_messages light.
 */
export interface ChatToolCall {
  /** Capability name, e.g. 'outfit.generate' */
  name: string;
  /** Raw arguments the model passed (unknown until validated by the capability) */
  args: unknown;
  /** True if the capability returned successfully; false if it threw */
  ok: boolean;
  /** Error message when ok=false; null otherwise */
  error: string | null;
}

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    /** Tool calls the assistant invoked, if any */
    toolCalls: jsonb('tool_calls').$type<ChatToolCall[]>(),
    /** Optional generation reference for assistant messages */
    generationId: uuid('generation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chat_messages_conversation_id_idx').on(table.conversationId),
    index('chat_messages_created_at_idx').on(table.createdAt),
  ],
);

// ─── Try-on (Phase 10) ───
export const tryOnJobs = pgTable('try_on_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  outfitId: uuid('outfit_id')
    .notNull()
    .references(() => outfits.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Translations (deferred) ───
export const translations = pgTable('translations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
