import { z } from 'zod';
import { and, eq, sql as drizzleSql } from 'drizzle-orm';
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
 * The conversation-summaries query, exported (unregistered) so the
 * SQL-shape regression test can pin the generated SQL.
 *
 * Drizzle's `${chatConversations.id}` interpolation inside a `sql`
 * template that lives inside a SELECT projection emits the bare column
 * name (`"id"`) when the select has no joins. Inside the cost subquery
 * both `chat_messages m` and `generations g` carry an `id`, so Postgres
 * rejected the bare reference with `column reference "id" is ambiguous`
 * (Sentry TELA-API-P; same bug class as admin.listUsers commit f729b5e).
 * Force the qualified outer-row reference with `sql.raw`.
 */
export function buildUserConversationsQuery(db: ReturnType<typeof getDb>, userId: string) {
  const outerConversationId = drizzleSql.raw('chat_conversations.id');

  return db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      messageCount: chatConversations.messageCount,
      chatCostCents: drizzleSql<number>`COALESCE((SELECT SUM(g.cost_cents)::float FROM chat_messages m JOIN generations g ON g.id = m.generation_id WHERE m.conversation_id = ${outerConversationId}), 0)`,
      createdAt: chatConversations.createdAt,
      lastMessageAt: chatConversations.lastMessageAt,
    })
    .from(chatConversations)
    .where(and(eq(chatConversations.userId, userId), eq(chatConversations.isAdminChat, false)))
    .orderBy(drizzleSql`${chatConversations.lastMessageAt} DESC NULLS LAST`);
}

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
  chatTool: true,

  async execute({ userId }) {
    const rows = await buildUserConversationsQuery(getDb(), userId);

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
