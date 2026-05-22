import { z } from 'zod';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { getDb, chatConversations } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
});

const conversation = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  messageCount: z.number().int(),
  chatCostCents: z.number(),
  createdAt: z.string(),
  lastMessageAt: z.string().nullable(),
});

const output = z.object({
  conversations: z.array(conversation),
});

/**
 * Conversation summary list for one user, newest-active first. No
 * messages in the payload (admin clicks into a conversation to read
 * the transcript via admin.getConversation). Per-conversation cost is
 * joined from chat_messages.generation_id → generations.
 *
 * Admin only.
 */
export const getUserConversations = registerCapability({
  name: 'admin.getUserConversations',
  description:
    'Conversation summary list for one user (no messages). Each row carries title, message count, per-conversation chat cost, and timestamps. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ userId }) {
    const db = getDb();

    const rows = await db
      .select({
        id: chatConversations.id,
        title: chatConversations.title,
        messageCount: chatConversations.messageCount,
        chatCostCents: drizzleSql<number>`COALESCE((SELECT SUM(g.cost_cents)::float FROM chat_messages m JOIN generations g ON g.id = m.generation_id WHERE m.conversation_id = ${chatConversations.id}), 0)`,
        createdAt: chatConversations.createdAt,
        lastMessageAt: chatConversations.lastMessageAt,
      })
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(drizzleSql`${chatConversations.lastMessageAt} DESC NULLS LAST`);

    return {
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        messageCount: r.messageCount,
        chatCostCents: r.chatCostCents,
        createdAt: r.createdAt.toISOString(),
        lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
      })),
    };
  },
});
