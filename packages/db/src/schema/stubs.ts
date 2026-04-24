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

export interface ChatToolCall {
  name: string; // capability name e.g. 'wardrobe.listItems'
  arguments: Record<string, unknown>;
  /** JSON-stringified result, or null if not yet executed */
  result: unknown | null;
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
