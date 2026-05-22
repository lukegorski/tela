/**
 * Server-side single-conversation transcript loader.
 * Mirrors admin.getConversation capability — keep return shapes aligned.
 * If schema changes, BOTH sites need updating.
 *
 * Joins chat_messages → generations to attach per-turn cost + model
 * (assistant messages with a generation reference). User messages and
 * any assistant message without a generation_id show costCents=null.
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

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  toolCalls: ChatToolCall[] | null;
  generationId: string | null;
  costCents: number | null;
  model: string | null;
  createdAt: string;
}

export interface ConversationMeta {
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

export interface ConversationDetail {
  conversation: ConversationMeta;
  messages: ConversationMessage[];
}

export async function getConversation(conversationId: string): Promise<ConversationDetail | null> {
  const sql = getSql();

  const [convRows, [{ cents: chatCostCents }], messages] = await Promise.all([
    sql<
      {
        id: string;
        title: string | null;
        user_id: string;
        email: string | null;
        display_name: string | null;
        message_count: number;
        created_at: Date;
        last_message_at: Date | null;
      }[]
    >`
      SELECT c.id, c.title, c.user_id, u.email, u.display_name,
             c.message_count, c.created_at, c.last_message_at
      FROM chat_conversations c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ${conversationId}
      LIMIT 1
    `,
    sql<{ cents: number }[]>`
      SELECT COALESCE(SUM(g.cost_cents)::float, 0) AS cents
      FROM chat_messages m
      LEFT JOIN generations g ON g.id = m.generation_id
      WHERE m.conversation_id = ${conversationId}
    `,
    sql<
      {
        id: string;
        role: string;
        content: string;
        tool_calls: ChatToolCall[] | null;
        generation_id: string | null;
        cost_cents: number | null;
        model: string | null;
        created_at: Date;
      }[]
    >`
      SELECT m.id, m.role, m.content, m.tool_calls,
             m.generation_id, g.cost_cents, g.model, m.created_at
      FROM chat_messages m
      LEFT JOIN generations g ON g.id = m.generation_id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY m.created_at ASC, m.id ASC
    `,
  ]);

  if (convRows.length === 0) return null;
  const c = convRows[0];

  return {
    conversation: {
      id: c.id,
      title: c.title,
      userId: c.user_id,
      email: c.email,
      displayName: c.display_name,
      messageCount: c.message_count,
      chatCostCents,
      createdAt: new Date(c.created_at as string | Date).toISOString(),
      lastMessageAt: c.last_message_at
        ? new Date(c.last_message_at as string | Date).toISOString()
        : null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls,
      generationId: m.generation_id,
      costCents: m.cost_cents,
      model: m.model,
      createdAt: new Date(m.created_at as string | Date).toISOString(),
    })),
  };
}
