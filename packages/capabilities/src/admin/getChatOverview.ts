import { z } from 'zod';
import { sql as drizzleSql } from 'drizzle-orm';
import { getDb, chatConversations, users } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  /** How many recent conversations to surface in the global feed. */
  recentLimit: z.number().int().min(1).max(100).default(20),
});

const stats = z.object({
  totalConversations: z.number().int(),
  totalMessages: z.number().int(),
  last7dMessages: z.number().int(),
  totalChatCostCents: z.number(),
});

const perUserRow = z.object({
  userId: z.string().uuid(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  conversationCount: z.number().int(),
  messageCount: z.number().int(),
  chatCostCents: z.number(),
  lastActiveAt: z.string().nullable(),
});

const recentConversation = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  userId: z.string().uuid(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  messageCount: z.number().int(),
  chatCostCents: z.number(),
  createdAt: z.string(),
  lastMessageAt: z.string().nullable(),
});

const output = z.object({
  stats,
  perUser: z.array(perUserRow),
  recentConversations: z.array(recentConversation),
});

/**
 * Aggregate chat data for the admin chat dashboard:
 *
 *   - stats: global totals (conversations, messages, last-7d messages,
 *     all-time chat cost)
 *   - perUser: each user that has any chat history, with per-user chat
 *     cost (filter: operation LIKE 'chat.%'), sorted by cost desc
 *   - recentConversations: the N most recently active conversations
 *     across all users, with per-conversation cost (joined through
 *     chat_messages.generation_id)
 *
 * Per-user chat cost uses the operation-name filter
 * (`operation LIKE 'chat.%'`). Per-conversation cost uses the
 * generation_id join, which is tighter — tool calls inside a chat
 * trigger other capabilities (outfit.generate, item.analyze, ...) that
 * don't carry the conversation_id, so they're excluded from per-
 * conversation cost. That's intentional: we want chat-attributable LLM
 * cost only, not the downstream cost of what the chat asked us to do.
 *
 * Admin only.
 */
export const getChatOverview = registerCapability({
  name: 'admin.getChatOverview',
  description:
    'Aggregate chat data for the admin chat dashboard: global stats, per-user breakdown with chat cost, and the most recent conversations across all users. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ recentLimit }) {
    const db = getDb();

    const [[statsRow], perUserRows, recentRows] = await Promise.all([
      db
        .select({
          totalConversations: drizzleSql<number>`(SELECT count(*)::int FROM chat_conversations)`,
          totalMessages: drizzleSql<number>`(SELECT count(*)::int FROM chat_messages)`,
          last7dMessages: drizzleSql<number>`(SELECT count(*)::int FROM chat_messages WHERE created_at >= now() - interval '7 days')`,
          totalChatCostCents: drizzleSql<number>`COALESCE((SELECT SUM(cost_cents)::float FROM generations WHERE operation LIKE 'chat.%'), 0)`,
        })
        .from(drizzleSql`(SELECT 1) AS _`),

      db
        .select({
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
          conversationCount: drizzleSql<number>`count(DISTINCT ${chatConversations.id})::int`,
          messageCount: drizzleSql<number>`COALESCE(SUM(${chatConversations.messageCount}), 0)::int`,
          chatCostCents: drizzleSql<number>`COALESCE((SELECT SUM(cost_cents)::float FROM generations WHERE user_id = ${users.id} AND operation LIKE 'chat.%'), 0)`,
          lastActiveAt: drizzleSql<Date | null>`MAX(${chatConversations.lastMessageAt})`,
        })
        .from(chatConversations)
        .innerJoin(users, drizzleSql`${users.id} = ${chatConversations.userId}`)
        .groupBy(users.id, users.email, users.displayName)
        .orderBy(drizzleSql`COALESCE((SELECT SUM(cost_cents)::float FROM generations WHERE user_id = ${users.id} AND operation LIKE 'chat.%'), 0) DESC, count(${chatConversations.id}) DESC`),

      db
        .select({
          id: chatConversations.id,
          title: chatConversations.title,
          userId: chatConversations.userId,
          email: users.email,
          displayName: users.displayName,
          messageCount: chatConversations.messageCount,
          chatCostCents: drizzleSql<number>`COALESCE((SELECT SUM(g.cost_cents)::float FROM chat_messages m JOIN generations g ON g.id = m.generation_id WHERE m.conversation_id = ${chatConversations.id}), 0)`,
          createdAt: chatConversations.createdAt,
          lastMessageAt: chatConversations.lastMessageAt,
        })
        .from(chatConversations)
        .innerJoin(users, drizzleSql`${users.id} = ${chatConversations.userId}`)
        .orderBy(drizzleSql`${chatConversations.lastMessageAt} DESC NULLS LAST`)
        .limit(recentLimit),
    ]);

    return {
      stats: {
        totalConversations: statsRow.totalConversations,
        totalMessages: statsRow.totalMessages,
        last7dMessages: statsRow.last7dMessages,
        totalChatCostCents: statsRow.totalChatCostCents,
      },
      perUser: perUserRows.map((r) => ({
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
        conversationCount: r.conversationCount,
        messageCount: r.messageCount,
        chatCostCents: r.chatCostCents,
        lastActiveAt: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
      })),
      recentConversations: recentRows.map((r) => ({
        id: r.id,
        title: r.title,
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
        messageCount: r.messageCount,
        chatCostCents: r.chatCostCents,
        createdAt: r.createdAt.toISOString(),
        lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
      })),
    };
  },
});
