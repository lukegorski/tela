import { z } from 'zod';
import { eq, asc, sql as drizzleSql } from 'drizzle-orm';
import { getDb, chatMessages, chatConversations } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
  /** Page size. Capped at 500 — admin views chronological history. */
  limit: z.number().int().min(1).max(500).default(200),
  offset: z.number().int().min(0).default(0),
});

const toolCallSchema = z.object({
  name: z.string(),
  args: z.unknown(),
  ok: z.boolean(),
  error: z.string().nullable(),
  result: z.unknown().optional(),
});

const message = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.string(),
  content: z.string(),
  toolCalls: z.array(toolCallSchema).nullable(),
  createdAt: z.string(),
});

const output = z.object({
  messages: z.array(message),
  total: z.number().int(),
});

/**
 * All chat messages for a single user, oldest-first, paginated.
 *
 * Joins through `chat_conversations` to filter by `userId` since
 * `chat_messages.conversation_id` is the only FK. Drops attachments from
 * the wire payload — admin doesn't need them and they'd require URL
 * signing. Admin only.
 */
export const getUserChats = registerCapability({
  name: 'admin.getUserChats',
  description:
    'All chat messages for one user, joined through chat_conversations and ordered chronologically. Drops attachments from the wire payload. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ userId, limit, offset }) {
    const db = getDb();

    const [[{ total }], rows] = await Promise.all([
      db
        .select({ total: drizzleSql<number>`count(*)::int` })
        .from(chatMessages)
        .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
        .where(eq(chatConversations.userId, userId)),
      db
        .select({
          id: chatMessages.id,
          conversationId: chatMessages.conversationId,
          role: chatMessages.role,
          content: chatMessages.content,
          toolCalls: chatMessages.toolCalls,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
        .where(eq(chatConversations.userId, userId))
        .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
        .limit(limit)
        .offset(offset),
    ]);

    return {
      messages: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
    };
  },
});
