import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { getDb, chatConversations, chatMessages } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  conversationId: z.string().uuid(),
});

const toolInvocation = z.object({
  name: z.string(),
  args: z.unknown(),
  ok: z.boolean(),
  error: z.string().nullable(),
});

const messageSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  content: z.string(),
  createdAt: z.string(),
  toolInvocations: z.array(toolInvocation).nullable(),
});

const output = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  messageCount: z.number(),
  createdAt: z.string(),
  messages: z.array(messageSchema),
});

export const getConversation = registerCapability({
  name: 'chat.getConversation',
  description: "Fetch a chat conversation with all its messages, scoped to the requesting user.",
  input,
  output,

  async execute({ conversationId }) {
    const { userId } = getRequestContext();
    const db = getDb();

    const convo = await db.query.chatConversations.findFirst({
      where: and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)),
    });
    if (!convo) throw new Error('Conversation not found');

    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        toolCalls: chatMessages.toolCalls,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt));

    return {
      id: convo.id,
      title: convo.title,
      messageCount: convo.messageCount,
      createdAt: convo.createdAt.toISOString(),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolInvocations: m.toolCalls
          ? m.toolCalls.map((tc) => ({
              name: tc.name,
              args: tc.args,
              ok: tc.ok,
              error: tc.error,
            }))
          : null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  },
});
