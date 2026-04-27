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
  /**
   * Capability return value when the tool succeeded. Drives chat rich-card
   * rendering (outfit grids, item grids) on the frontend.
   */
  result?: unknown;
}

/**
 * Lightweight client-side mirror of @tela/db's `ChatAttachment`. Defined
 * here so this server helper doesn't pull the heavier package into the
 * Next.js edge bundle.
 */
export type ChatAttachmentLite =
  | { type: 'image'; photoId: string }
  | { type: 'wardrobe_item'; itemId: string };

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  toolInvocations: ChatToolInvocation[] | null;
  attachments: ChatAttachmentLite[] | null;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  /** Messages in chronological order (oldest first). */
  messages: ChatMessage[];
  /** True if older messages remain beyond the current page. */
  hasMore: boolean;
}

export interface GetLatestConversationOpts {
  /** Page size. Default 50, max 200. */
  limit?: number;
  /** Skip the N most-recent messages — used to page back into history. */
  offset?: number;
}

/**
 * Load the user's most-recently-active conversation (or null if they have none).
 * MVP single-conversation pattern — multi-conversation UI is deferred.
 *
 * Pagination is offset-based against `created_at DESC`: offset 0 returns the
 * latest 50 messages (chronological), offset 50 returns the next 50 older.
 * Caller prepends older pages to its in-memory list.
 */
export async function getLatestConversation(
  userId: string,
  opts: GetLatestConversationOpts = {},
): Promise<ChatConversation | null> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

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
  // Fetch limit+1 newest-first so we can detect hasMore without a COUNT(*).
  const rows = await sql<
    {
      id: string;
      role: string;
      content: string;
      tool_calls: ChatToolInvocation[] | null;
      attachments: ChatAttachmentLite[] | null;
      created_at: Date;
    }[]
  >`
    SELECT id, role, content, tool_calls, attachments, created_at
    FROM chat_messages
    WHERE conversation_id = ${c.id}
    ORDER BY created_at DESC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `;

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).slice().reverse();

  return {
    id: c.id,
    title: c.title,
    messageCount: c.message_count,
    createdAt: c.created_at.toISOString(),
    messages: page.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolInvocations: m.tool_calls,
      attachments: m.attachments,
      createdAt: m.created_at.toISOString(),
    })),
    hasMore,
  };
}
