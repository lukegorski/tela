import { z } from 'zod';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { getDb, chatConversations, users } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const adminChatSummary = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  messageCount: z.number().int(),
  chatCostCents: z.number(),
  createdAt: z.string(),
  lastMessageAt: z.string().nullable(),
  startedBy: z.object({
    userId: z.string().uuid(),
    email: z.string().nullable(),
    displayName: z.string().nullable(),
  }),
});

const output = z.object({
  conversations: z.array(adminChatSummary),
  hasMore: z.boolean(),
});

/**
 * Lists ALL admin AI chats across ALL admins (P6 lock: any admin sees
 * any admin chat). Sorted last_message_at DESC. Each row includes
 * `startedBy: { userId, email, displayName }` so the AdminAiChat
 * sidebar can render "started by cofounder" attribution.
 *
 * Per-conversation chat cost is joined from chat_messages.generation_id
 * → generations.cost_cents, matching admin.getConversation's per-turn
 * cost semantics.
 *
 * Admin only.
 */
export const listAdminChats = registerCapability({
  name: 'admin.listAdminChats',
  description:
    'List all admin AI chats across all admins (any admin sees any). Sorted most recently active first. Each row includes startedBy attribution. Admin only.',
  input,
  output,
  requiresAdmin: true,
  chatTool: true,

  async execute({ limit, offset }) {
    const db = getDb();

    // Fetch limit+1 to detect hasMore without a COUNT(*).
    const rows = await db
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
      .innerJoin(users, eq(users.id, chatConversations.userId))
      .where(eq(chatConversations.isAdminChat, true))
      .orderBy(drizzleSql`${chatConversations.lastMessageAt} DESC NULLS LAST`)
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      conversations: page.map((r) => ({
        id: r.id,
        title: r.title,
        messageCount: r.messageCount,
        chatCostCents: r.chatCostCents,
        createdAt: r.createdAt.toISOString(),
        lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
        startedBy: {
          userId: r.userId,
          email: r.email,
          displayName: r.displayName,
        },
      })),
      hasMore,
    };
  },
});
