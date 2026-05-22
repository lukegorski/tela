import { z } from 'zod';
import { eq, asc, sql as drizzleSql } from 'drizzle-orm';
import { getDb, chatConversations, chatMessages, generations, users } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  conversationId: z.string().uuid(),
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
  role: z.string(),
  content: z.string(),
  toolCalls: z.array(toolCallSchema).nullable(),
  generationId: z.string().uuid().nullable(),
  costCents: z.number().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});

const output = z.object({
  conversation: z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    userId: z.string().uuid(),
    email: z.string().nullable(),
    displayName: z.string().nullable(),
    messageCount: z.number().int(),
    chatCostCents: z.number(),
    createdAt: z.string(),
    lastMessageAt: z.string().nullable(),
  }),
  messages: z.array(message),
});

/**
 * Full transcript of a single conversation: metadata (with user info),
 * per-conversation chat cost, and every message in chronological order
 * with per-turn cost + model attached (joined from generations).
 *
 * Admin only.
 */
export const getConversation = registerCapability({
  name: 'admin.getConversation',
  description:
    'Single conversation with full message transcript, per-turn cost + model from generations, and user metadata. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ conversationId }) {
    const db = getDb();

    const [convRows, [{ chatCostCents }], rows] = await Promise.all([
      db
        .select({
          id: chatConversations.id,
          title: chatConversations.title,
          userId: chatConversations.userId,
          email: users.email,
          displayName: users.displayName,
          messageCount: chatConversations.messageCount,
          createdAt: chatConversations.createdAt,
          lastMessageAt: chatConversations.lastMessageAt,
        })
        .from(chatConversations)
        .innerJoin(users, eq(users.id, chatConversations.userId))
        .where(eq(chatConversations.id, conversationId))
        .limit(1),
      db
        .select({
          chatCostCents: drizzleSql<number>`COALESCE(SUM(${generations.costCents})::float, 0)`,
        })
        .from(chatMessages)
        .leftJoin(generations, eq(generations.id, chatMessages.generationId))
        .where(eq(chatMessages.conversationId, conversationId)),
      db
        .select({
          id: chatMessages.id,
          role: chatMessages.role,
          content: chatMessages.content,
          toolCalls: chatMessages.toolCalls,
          generationId: chatMessages.generationId,
          costCents: generations.costCents,
          model: generations.model,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .leftJoin(generations, eq(generations.id, chatMessages.generationId))
        .where(eq(chatMessages.conversationId, conversationId))
        .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id)),
    ]);

    if (convRows.length === 0) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    const c = convRows[0];

    return {
      conversation: {
        id: c.id,
        title: c.title,
        userId: c.userId,
        email: c.email,
        displayName: c.displayName,
        messageCount: c.messageCount,
        chatCostCents,
        createdAt: c.createdAt.toISOString(),
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      },
      messages: rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ?? null,
        generationId: m.generationId ?? null,
        costCents: m.costCents,
        model: m.model,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  },
});
