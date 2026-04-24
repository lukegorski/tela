import 'server-only';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  _sql = postgres(process.env.DATABASE_URL!, {
    max: 5,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  return _sql;
}

export interface ChatToolInvocation {
  name: string;
  args: unknown;
  ok: boolean;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  toolInvocations: ChatToolInvocation[] | null;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  messages: ChatMessage[];
}

/**
 * Load the user's most-recently-active conversation (or null if they have none).
 * MVP single-conversation pattern — Phase 9 will add a conversation list UI.
 */
export async function getLatestConversation(userId: string): Promise<ChatConversation | null> {
  const sql = getSql();

  const convos = await sql<
    {
      id: string;
      title: string | null;
      message_count: number;
      created_at: Date;
    }[]
  >`
    SELECT id, title, message_count, created_at
    FROM chat_conversations
    WHERE user_id = ${userId}
    ORDER BY COALESCE(last_message_at, created_at) DESC
    LIMIT 1
  `;
  if (convos.length === 0) return null;

  const c = convos[0];
  const messages = await sql<
    {
      id: string;
      role: string;
      content: string;
      tool_calls: ChatToolInvocation[] | null;
      created_at: Date;
    }[]
  >`
    SELECT id, role, content, tool_calls, created_at
    FROM chat_messages
    WHERE conversation_id = ${c.id}
    ORDER BY created_at ASC
  `;

  return {
    id: c.id,
    title: c.title,
    messageCount: c.message_count,
    createdAt: c.created_at.toISOString(),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolInvocations: m.tool_calls,
      createdAt: m.created_at.toISOString(),
    })),
  };
}
