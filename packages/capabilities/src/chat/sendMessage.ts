import { z } from 'zod';
import { eq, desc, and, sql as drizzleSql } from 'drizzle-orm';
import {
  getDb,
  chatConversations,
  chatMessages,
  styleProfiles,
  closetItems,
} from '@tela/db';
import { call } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  /** Existing conversation to continue, or null to start a new one. */
  conversationId: z.string().uuid().nullable().default(null),
  message: z.string().min(1).max(4000),
  locale: z.string().default('en'),
});

const output = z.object({
  conversationId: z.string().uuid(),
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  assistantContent: z.string(),
  costCents: z.number(),
});

const MAX_HISTORY_MESSAGES = 20;

/**
 * Send a chat message and get an AI reply.
 *
 * MVP scope (Phase 8.7):
 *   - Single AI call per turn — no recursive tool-calling, no streaming, no
 *     memory summarization. Phase 9 expands this.
 *   - Loads recent messages for conversation context (last 20)
 *   - Injects style profile + wardrobe summary as system context
 *   - Persists both messages atomically (best-effort — no transaction yet)
 */
export const sendMessage = registerCapability({
  name: 'chat.sendMessage',
  description:
    "Send a chat message to the AI stylist and persist the exchange. Returns the assistant's reply. MVP — no streaming, no recursive tool-calling.",
  input,
  output,

  async execute({ conversationId, message, locale }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // 1. Find or create conversation
    let resolvedConvoId: string;
    if (conversationId) {
      // Verify ownership
      const convo = await db.query.chatConversations.findFirst({
        where: and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)),
      });
      if (!convo) throw new Error('Conversation not found or does not belong to user');
      resolvedConvoId = convo.id;
    } else {
      const [created] = await db
        .insert(chatConversations)
        .values({
          userId,
          title: message.slice(0, 80),
          messageCount: 0,
          lastMessageAt: new Date(),
        })
        .returning({ id: chatConversations.id });
      resolvedConvoId = created.id;

      await logEvent({
        userId,
        type: 'chat.conversation_started',
        source,
        payload: { conversationId: resolvedConvoId },
      });
    }

    // 2. Load recent message history (excluding the new one)
    const history = await db
      .select({
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, resolvedConvoId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(MAX_HISTORY_MESSAGES);

    history.reverse(); // chronological order for the prompt

    // 3. Insert user message
    const [userMsg] = await db
      .insert(chatMessages)
      .values({
        conversationId: resolvedConvoId,
        role: 'user',
        content: message,
      })
      .returning({ id: chatMessages.id });

    await logEvent({
      userId,
      type: 'chat.message_sent',
      source,
      payload: { conversationId: resolvedConvoId, messageId: userMsg.id },
    });

    // 4. Load context for the system prompt
    const [profile, items] = await Promise.all([
      db.query.styleProfiles.findFirst({ where: eq(styleProfiles.userId, userId) }),
      db
        .select({
          category: closetItems.category,
          subcategory: closetItems.subcategory,
          primaryColor: closetItems.primaryColor,
          description: closetItems.description,
        })
        .from(closetItems)
        .where(eq(closetItems.userId, userId))
        .limit(50),
    ]);

    const profileText = profile?.profileText ?? 'No profile yet — user just signed up.';
    const dimensions = profile?.dimensions
      ? Object.entries(profile.dimensions)
          .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}`)
          .join(', ')
      : '(not yet computed)';
    const wardrobeSummary =
      items.length === 0
        ? '(empty wardrobe)'
        : items
            .map(
              (i) =>
                `- ${i.primaryColor} ${i.subcategory ?? i.category}${
                  i.description ? ` — ${i.description}` : ''
                }`,
            )
            .join('\n');

    // 5. Build full conversation prompt
    const prompt = await getPrompt('chat.system');
    const conversationText = history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
    const fullUserPrompt = conversationText
      ? `${conversationText}\n\nUSER: ${message}`
      : `USER: ${message}`;

    // 6. Call AI
    const result = await call<string>({
      operation: 'chat.sendMessage',
      userId,
      promptName: prompt.name,
      promptVersionId: prompt.versionId,
      promptTemplate: prompt.template,
      userPrompt: fullUserPrompt,
      model: 'gpt-5.4-mini',
      variables: {
        profile_text: profileText,
        style_dimensions: dimensions,
        wardrobe_summary: wardrobeSummary,
        locale,
      },
      temperature: 0.7,
      responseFormat: 'text',
    });

    const assistantContent =
      typeof result.data === 'string' ? result.data : JSON.stringify(result.data);

    // 7. Insert assistant message
    const [assistantMsg] = await db
      .insert(chatMessages)
      .values({
        conversationId: resolvedConvoId,
        role: 'assistant',
        content: assistantContent,
        generationId: result.provenance.generationId,
      })
      .returning({ id: chatMessages.id });

    // 8. Update conversation aggregates
    await db
      .update(chatConversations)
      .set({
        messageCount: drizzleSql`${chatConversations.messageCount} + 2`,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, resolvedConvoId));

    await logEvent({
      userId,
      type: 'chat.message_received',
      source,
      payload: {
        conversationId: resolvedConvoId,
        messageId: assistantMsg.id,
        costCents: result.provenance.costCents,
      },
    });

    return {
      conversationId: resolvedConvoId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantContent,
      costCents: result.provenance.costCents,
    };
  },
});
