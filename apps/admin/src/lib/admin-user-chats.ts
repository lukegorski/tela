/**
 * Server-side chat-message history for one user.
 * Mirrors admin.getUserChats capability — keep return shapes aligned.
 * If schema changes, BOTH sites need updating.
 *
 * Joins chat_messages → chat_conversations to filter by user_id. Drops
 * attachments from the payload (admin doesn't need them and they'd
 * require URL signing).
 */
import 'server-only';
import { getSql } from '@tela/db';

export interface ChatToolCall {
  name: string;
  args: unknown;
  ok: boolean;
  error: string | null;
  result?: unknown;
}

export interface AdminChatMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: ChatToolCall[] | null;
  createdAt: string;
}

export interface UserChatsResult {
  messages: AdminChatMessage[];
  total: number;
}

export async function getUserChats(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<UserChatsResult> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [[{ count: total }], rows] = await Promise.all([
    sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ${userId}
    `,
    sql<
      {
        id: string;
        conversation_id: string;
        role: string;
        content: string;
        tool_calls: ChatToolCall[] | null;
        created_at: Date;
      }[]
    >`
      SELECT
        m.id, m.conversation_id, m.role, m.content, m.tool_calls, m.created_at
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ${userId}
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
  ]);

  return {
    messages: rows.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls,
      createdAt: new Date(m.created_at as string | Date).toISOString(),
    })),
    total,
  };
}
