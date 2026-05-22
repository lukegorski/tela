/**
 * Server-side conversation list (no messages) for one user.
 * Mirrors admin.getUserConversations capability — keep return shapes
 * aligned. If schema changes, BOTH sites need updating.
 */
import 'server-only';
import { getSql } from '@tela/db';

export interface UserConversationSummary {
  id: string;
  title: string | null;
  messageCount: number;
  chatCostCents: number;
  createdAt: string;
  lastMessageAt: string | null;
}

export async function getUserConversations(userId: string): Promise<UserConversationSummary[]> {
  const sql = getSql();

  const rows = await sql<
    {
      id: string;
      title: string | null;
      message_count: number;
      chat_cost_cents: number;
      created_at: Date;
      last_message_at: Date | null;
    }[]
  >`
    SELECT
      c.id,
      c.title,
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
    WHERE c.user_id = ${userId}
    ORDER BY c.last_message_at DESC NULLS LAST
  `;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messageCount: r.message_count,
    chatCostCents: r.chat_cost_cents,
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    lastMessageAt: r.last_message_at
      ? new Date(r.last_message_at as string | Date).toISOString()
      : null,
  }));
}
