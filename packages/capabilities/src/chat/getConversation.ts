import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, chatConversations, chatMessages } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  conversationId: z.string().uuid(),
  /**
   * Page size. Default 50; cap 200 so a malicious client can't blow up
   * the wire payload. Pagination is offset-based — fine for chat sizes,
   * upgradeable to cursor-based later if needed.
   */
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const toolInvocation = z.object({
  name: z.string(),
  args: z.unknown(),
  ok: z.boolean(),
  error: z.string().nullable(),
  /** Capability return value when ok=true. Drives chat rich-card rendering. */
  result: z.unknown().optional(),
});

const attachment = z.discriminatedUnion('type', [
  z.object({ type: z.literal('image'), photoId: z.string().uuid() }),
  z.object({ type: z.literal('wardrobe_item'), itemId: z.string().uuid() }),
]);

const messageSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  content: z.string(),
  createdAt: z.string(),
  toolInvocations: z.array(toolInvocation).nullable(),
  attachments: z.array(attachment).nullable(),
});

const output = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  messageCount: z.number(),
  createdAt: z.string(),
  /**
   * Messages in chronological order (oldest first). When `offset > 0`
   * these are the older messages — caller is responsible for prepending
   * to its in-memory list.
   */
  messages: z.array(messageSchema),
  /** True if there are more messages older than the current page. */
  hasMore: z.boolean(),
});

export const getConversation = registerCapability({
  name: 'chat.getConversation',
  description:
    "Fetch a chat conversation with a paginated slice of its messages, scoped to the requesting user. Returns hasMore=true when older messages remain (use offset to page back).",
  input,
  output,

  async execute({ conversationId, limit, offset }) {
    const { userId } = getRequestContext();
    const db = getDb();

    const convo = await db.query.chatConversations.findFirst({
      where: and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)),
    });
    if (!convo) throw new Error('Conversation not found');

    // Pull the page newest-first by createdAt + offset, then reverse to
    // chronological order. We fetch limit+1 so we can detect hasMore
    // without a COUNT(*).
    const rows = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        toolCalls: chatMessages.toolCalls,
        attachments: chatMessages.attachments,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    page.reverse();

    return {
      id: convo.id,
      title: convo.title,
      messageCount: convo.messageCount,
      createdAt: convo.createdAt.toISOString(),
      messages: page.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolInvocations: m.toolCalls
          ? m.toolCalls.map((tc) => ({
              name: tc.name,
              args: tc.args,
              ok: tc.ok,
              error: tc.error,
              result: tc.result,
            }))
          : null,
        attachments: m.attachments ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore,
    };
  },
});
