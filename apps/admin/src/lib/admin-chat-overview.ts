/**
 * Server-side chat overview for the admin chat dashboard.
 * Mirrors admin.getChatOverview capability — keep return shapes aligned.
 * If schema changes, BOTH sites need updating.
 *
 * Per-user chat cost: operation LIKE 'chat.%' on generations.
 * Per-conversation cost: chat_messages.generation_id → generations.cost_cents.
 * Tool-call downstream operations (outfit.generate, item.analyze, etc.)
 * are NOT included in chat cost — those carry their own operation
 * names and show in the user's main cost report.
 */
import 'server-only';
import { getSql } from '@tela/db';

export interface ChatStats {
  totalConversations: number;
  totalMessages: number;
  last7dMessages: number;
  totalChatCostCents: number;
}

export interface PerUserChatRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  conversationCount: number;
  messageCount: number;
  chatCostCents: number;
  lastActiveAt: string | null;
}

export interface RecentConversation {
  id: string;
  title: string | null;
  userId: string;
  email: string | null;
  displayName: string | null;
  messageCount: number;
  chatCostCents: number;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface ChatOverview {
  stats: ChatStats;
  perUser: PerUserChatRow[];
  recentConversations: RecentConversation[];
}

export async function getChatOverview(opts: { recentLimit?: number } = {}): Promise<ChatOverview> {
  const sql = getSql();
  const recentLimit = Math.min(Math.max(opts.recentLimit ?? 20, 1), 100);

  const [[stats], perUserRows, recentRows] = await Promise.all([
    sql<
      {
        total_conversations: number;
        total_messages: number;
        last7d_messages: number;
        total_chat_cost_cents: number;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM chat_conversations WHERE is_admin_chat = false) AS total_conversations,
        (SELECT count(*)::int FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id WHERE c.is_admin_chat = false) AS total_messages,
        (SELECT count(*)::int FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id WHERE c.is_admin_chat = false AND m.created_at >= now() - interval '7 days') AS last7d_messages,
        COALESCE((SELECT SUM(cost_cents)::float FROM generations WHERE operation LIKE 'chat.%'), 0) AS total_chat_cost_cents
    `,
    sql<
      {
        user_id: string;
        email: string | null;
        display_name: string | null;
        conversation_count: number;
        message_count: number;
        chat_cost_cents: number;
        last_active_at: Date | null;
      }[]
    >`
      SELECT
        u.id AS user_id,
        u.email,
        u.display_name,
        count(DISTINCT c.id)::int AS conversation_count,
        COALESCE(SUM(c.message_count), 0)::int AS message_count,
        COALESCE((
          SELECT SUM(g.cost_cents)::float
          FROM generations g
          WHERE g.user_id = u.id AND g.operation LIKE 'chat.%'
        ), 0) AS chat_cost_cents,
        MAX(c.last_message_at) AS last_active_at
      FROM chat_conversations c
      JOIN users u ON u.id = c.user_id
      WHERE c.is_admin_chat = false
      GROUP BY u.id, u.email, u.display_name
      ORDER BY chat_cost_cents DESC, count(c.id) DESC
    `,
    sql<
      {
        id: string;
        title: string | null;
        user_id: string;
        email: string | null;
        display_name: string | null;
        message_count: number;
        chat_cost_cents: number;
        created_at: Date;
        last_message_at: Date | null;
      }[]
    >`
      SELECT
        c.id,
        c.title,
        c.user_id,
        u.email,
        u.display_name,
        c.message_count,
        COALESCE((
          SELECT SUM(g.cost_cents)::float
          FROM chat_messages m
          JOIN generations g ON g.id = m.generation_id
          WHERE m.conversation_id = c.id
        ), 0) AS chat_cost_cents,
        c.created_at,
        c.last_message_at
      FROM chat_conversations c
      JOIN users u ON u.id = c.user_id
      WHERE c.is_admin_chat = false
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT ${recentLimit}
    `,
  ]);

  return {
    stats: {
      totalConversations: stats.total_conversations,
      totalMessages: stats.total_messages,
      last7dMessages: stats.last7d_messages,
      totalChatCostCents: stats.total_chat_cost_cents,
    },
    perUser: perUserRows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name,
      conversationCount: r.conversation_count,
      messageCount: r.message_count,
      chatCostCents: r.chat_cost_cents,
      lastActiveAt: r.last_active_at
        ? new Date(r.last_active_at as string | Date).toISOString()
        : null,
    })),
    recentConversations: recentRows.map((r) => ({
      id: r.id,
      title: r.title,
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name,
      messageCount: r.message_count,
      chatCostCents: r.chat_cost_cents,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
      lastMessageAt: r.last_message_at
        ? new Date(r.last_message_at as string | Date).toISOString()
        : null,
    })),
  };
}
