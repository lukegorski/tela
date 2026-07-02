/**
 * Tables for domains being filled out incrementally during Phase 8+.
 * Originally stubs; chat is now real (Phase 8.7), try_on + translations
 * still minimal until their respective phases.
 */
import { pgTable, uuid, timestamp, varchar, text, jsonb, integer, index, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
    /** Admin AI chat marker (Phase 14c). User-facing + per-user admin queries filter on this. */
    isAdminChat: boolean('is_admin_chat').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chat_conversations_user_id_idx').on(table.userId),
    index('chat_conversations_is_admin_chat_idx')
      .on(table.isAdminChat)
      .where(sql`is_admin_chat = true`),
  ],
);

/**
 * One tool invocation made by the assistant during a chat turn.
 *
 * Stored as jsonb on chat_messages.tool_calls when role='assistant'. Captures
 * enough to render the activity in the UI ("generated 3 outfits", "looked
 * up the floral capris") and to debug failed turns.
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
  /**
   * Capability return value (when ok=true), used by the chat UI to render
   * rich cards (outfit grids, item grids) below the assistant message.
   * Optional + JSONB-stored so existing rows stay valid without migration.
   */
  result?: unknown;
}

/**
 * One attachment on a user-role chat message. The client passes only the
 * row id (photoId / itemId); the server resolves to actual URLs at use
 * time, so URLs aren't persisted and can't be forged.
 *
 * `image-legacy` is the migration-only variant: it preserves the legacy
 * Firebase Storage URL on imported chat messages. Renderers display it
 * as `<img src>` directly. Per Phase 11 D4 / M5, legacy Firebase Storage
 * MUST stay alive until a follow-up workstream converts these URLs to
 * Supabase Storage paths and rewrites the attachments to the canonical
 * `{ type: 'image', photoId }` shape. New (non-migrated) chat traffic
 * never produces this variant.
 */
export type ChatAttachment =
  | { type: 'image'; photoId: string }
  | { type: 'wardrobe_item'; itemId: string }
  | { type: 'image-legacy'; url: string; sourceBucket?: string };

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
    /**
     * Attachments on user messages: photo references (photoId) or wardrobe
     * item references (itemId). Server resolves to URLs / descriptions at
     * use; never client-supplied URLs.
     */
    attachments: jsonb('attachments').$type<ChatAttachment[]>(),
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

/**
 * Lifecycle states for a single try-on attempt:
 *   pending    — created but not yet sent to Fashn
 *   running    — at least one Fashn /run has been issued; we own a job ID
 *   complete   — final image stored at result_storage_path
 *   failed     — a step errored; see `error`
 */
export type TryOnStatus = 'pending' | 'running' | 'complete' | 'failed';

/**
 * The garment currently being applied — written before every Fashn call
 * (in all pipelines) as the resume cursor for crashed/expired attempts,
 * and cleared when the job completes. See tryon/process.ts for the
 * idempotent-resume contract.
 */
export type TryOnStep = 'bottoms' | 'top' | 'outerwear' | 'dress';

export const tryOnJobs = pgTable(
  'try_on_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    outfitId: uuid('outfit_id')
      .notNull()
      .references(() => outfits.id, { onDelete: 'cascade' }),

    /** Lifecycle state. See TryOnStatus. */
    status: varchar('status', { length: 20 }).notNull().default('pending').$type<TryOnStatus>(),

    /** Which built-in or self model image is being tried on. */
    modelImageUrl: text('model_image_url').notNull(),

    /**
     * The Fashn prediction ID for the currently-running step (if any).
     * Null when the job is not actively waiting on Fashn (pending, complete,
     * failed) and for the brief window between steps in a layered pipeline.
     */
    asyncJobId: varchar('async_job_id', { length: 128 }),
    /** Step the asyncJobId belongs to, when running a multi-step pipeline. */
    asyncStep: varchar('async_step', { length: 20 }).$type<TryOnStep>(),

    /**
     * Most recent intermediate image URL produced by Fashn — kept around so
     * the next step can layer on top of it. Becomes the final image when
     * status flips to 'complete' (and is then mirrored into Supabase Storage
     * via result_storage_path).
     */
    intermediateImageUrl: text('intermediate_image_url'),

    /** Where the final composited image lives in Supabase Storage. */
    resultStoragePath: text('result_storage_path'),

    /** Sum of cents we've recorded for this job across all Fashn calls. */
    costCents: integer('cost_cents').notNull().default(0),

    /** When status='failed', the human-readable error. */
    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('try_on_jobs_user_id_idx').on(table.userId),
    index('try_on_jobs_outfit_id_idx').on(table.outfitId),
    index('try_on_jobs_status_idx').on(table.status),
  ],
);

// ─── Translations (deferred) ───
export const translations = pgTable('translations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
