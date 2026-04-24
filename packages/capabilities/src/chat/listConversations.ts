import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { getDb, chatConversations } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

const output = z.object({
  conversations: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().nullable(),
      messageCount: z.number(),
      lastMessageAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

export const listConversations = registerCapability({
  name: 'chat.listConversations',
  description: "List the user's chat conversations, most recent first.",
  input,
  output,

  async execute({ limit }) {
    const { userId } = getRequestContext();
    const db = getDb();

    const convos = await db
      .select({
        id: chatConversations.id,
        title: chatConversations.title,
        messageCount: chatConversations.messageCount,
        lastMessageAt: chatConversations.lastMessageAt,
        createdAt: chatConversations.createdAt,
      })
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(desc(chatConversations.lastMessageAt))
      .limit(limit);

    return {
      conversations: convos.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  },
});
