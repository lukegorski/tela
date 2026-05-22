import { z } from 'zod';
import { eq, desc, and, sql as drizzleSql } from 'drizzle-orm';
import {
  getDb,
  chatConversations,
  chatMessages,
  styleProfiles,
  closetItems,
} from '@tela/db';
import { callMulti, type ChatMessage } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { buildToolCatalog, dispatchTool } from './toolCatalog.js';

const input = z.object({
  /** Existing conversation to continue, or null to start a new one. */
  conversationId: z.string().uuid().nullable().default(null),
  message: z.string().min(1).max(4000),
  locale: z.string().default('en'),
});

const toolInvocationSchema = z.object({
  name: z.string(),
  args: z.unknown(),
  ok: z.boolean(),
  error: z.string().nullable(),
});

const output = z.object({
  conversationId: z.string().uuid(),
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  assistantContent: z.string(),
  costCents: z.number(),
  /**
   * Tools the AI invoked while producing this reply, in execution order.
   * The frontend uses this to show the user what the chat actually did
   * ("generated 3 outfits", "viewed the floral capris", etc.).
   */
  toolInvocations: z.array(toolInvocationSchema),
});

const MAX_HISTORY_MESSAGES = 20;
/** Hard cap on tool-call rounds per chat turn — matches current production. */
const MAX_TOOL_DEPTH = 5;

/**
 * Send a chat message and get an AI reply.
 *
 * Phase 9.1 scope:
 *   - Multi-turn messages (system + history + tool calls + tool results +
 *     assistant) — no more concatenating history into a single user prompt.
 *   - Tool-calling: the AI can invoke any capability marked `chatTool: true`.
 *     Loop runs up to MAX_TOOL_DEPTH rounds, executing tool calls in
 *     parallel within a round, surfacing tool errors as structured
 *     responses so the model can recover.
 *   - Still no streaming (Phase 9.2) and no memory summarization (Phase 9.3).
 *   - Tool invocations stored on the assistant message (jsonb tool_calls
 *     column) so the frontend can render what happened.
 */
export const sendMessage = registerCapability({
  name: 'chat.sendMessage',
  description:
    "Send a chat message to the AI stylist and persist the exchange. The AI may call tools (any chat-enabled capability) recursively up to a depth limit. Returns the assistant's final reply plus the tool invocations that produced it.",
  input,
  output,

  async execute({ conversationId, message, locale }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // 1. Find or create conversation
    let resolvedConvoId: string;
    if (conversationId) {
      // Verify ownership + reject admin chats (the user chat endpoint must
      // never extend an admin chat — different model + tool catalog).
      const convo = await db.query.chatConversations.findFirst({
        where: and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId),
          eq(chatConversations.isAdminChat, false),
        ),
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

    // 2. Load recent message history (excluding the new one). Sort
    // chronologically for the model.
    const history = await db
      .select({
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, resolvedConvoId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(MAX_HISTORY_MESSAGES);
    history.reverse();

    // 3. Insert user message immediately so it appears even if the AI fails.
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

    const prompt = await getPrompt('chat.system');

    // Render the system template with our context variables. The template
    // uses {{var}} placeholders; do the substitution here since callMulti
    // takes already-rendered messages.
    const renderedSystem = prompt.template
      .replaceAll('{{profile_text}}', profileText)
      .replaceAll('{{style_dimensions}}', dimensions)
      .replaceAll('{{wardrobe_summary}}', wardrobeSummary)
      .replaceAll('{{locale}}', locale);

    // 5. Build the multi-turn message list
    const messages: ChatMessage[] = [
      { role: 'system', content: renderedSystem },
      ...history.map<ChatMessage>((m) => ({
        // historical roles are 'user' | 'assistant' (we don't yet persist
        // tool messages), so this cast is safe
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    // 6. Build the tool catalog the model is allowed to call
    const tools = buildToolCatalog();

    // 7. Tool-call loop. Each iteration is one model round-trip; if the
    // model returns tool_calls, we execute them all in parallel, append the
    // results as tool messages, and let the model take another turn. Up to
    // MAX_TOOL_DEPTH iterations.
    const toolInvocations: {
      name: string;
      args: unknown;
      ok: boolean;
      error: string | null;
    }[] = [];
    let totalCostCents = 0;
    let lastGenerationId: string | null = null;
    let assistantContent: string | null = null;

    for (let depth = 0; depth < MAX_TOOL_DEPTH; depth++) {
      const result = await callMulti({
        operation: 'chat.sendMessage',
        userId,
        promptName: prompt.name,
        promptVersionId: prompt.versionId,
        messages,
        tools,
        model: 'gpt-5.4-mini',
        temperature: 0.7,
      });
      totalCostCents += result.provenance.costCents;
      lastGenerationId = result.provenance.generationId;

      const assistantMsg = result.response.message;
      messages.push(assistantMsg);

      // No tool_calls → done. Capture the text and break.
      if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
        assistantContent = assistantMsg.content ?? '';
        break;
      }

      // Execute every tool call from this assistant turn in parallel.
      const callResults = await Promise.all(
        assistantMsg.toolCalls.map(async (tc) => {
          await logEvent({
            userId,
            type: 'chat.tool_invoked',
            source,
            payload: {
              conversationId: resolvedConvoId,
              tool: tc.name,
            },
          });
          const dispatch = await dispatchTool(tc.name, tc.args);
          return { tc, dispatch };
        }),
      );

      // Append a tool message per call (in the same order the model
      // requested) AND record into our toolInvocations snapshot.
      for (const { tc, dispatch } of callResults) {
        toolInvocations.push({
          name: tc.name,
          args: tc.args,
          ok: dispatch.ok,
          error: dispatch.error ? `${dispatch.error.name}: ${dispatch.error.message}` : null,
        });
        const payload = dispatch.ok
          ? { ok: true, result: dispatch.result }
          : { ok: false, error: dispatch.error };
        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          content: JSON.stringify(payload),
        });
      }

      // Continue the loop — model gets to react to the tool results.
    }

    if (assistantContent === null) {
      // Hit the depth cap without a final text answer. Force a final text
      // turn by stripping tool access and asking the model to summarize.
      const finalResult = await callMulti({
        operation: 'chat.sendMessage',
        userId,
        promptName: prompt.name,
        promptVersionId: prompt.versionId,
        messages: [
          ...messages,
          {
            role: 'user',
            content:
              'You hit the tool-call depth limit. Reply now in plain text summarizing what you accomplished and what the user should do next.',
          },
        ],
        // No tools on this final pass.
        model: 'gpt-5.4-mini',
        temperature: 0.5,
      });
      totalCostCents += finalResult.provenance.costCents;
      lastGenerationId = finalResult.provenance.generationId;
      assistantContent = finalResult.response.message.content ?? '(no reply)';
    }

    // 8. Persist the assistant message + tool calls
    const [assistantRow] = await db
      .insert(chatMessages)
      .values({
        conversationId: resolvedConvoId,
        role: 'assistant',
        content: assistantContent,
        toolCalls: toolInvocations.length > 0 ? toolInvocations : null,
        generationId: lastGenerationId ?? undefined,
      })
      .returning({ id: chatMessages.id });

    // 9. Update conversation aggregates
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
        messageId: assistantRow.id,
        costCents: totalCostCents,
        toolInvocations: toolInvocations.length,
      },
    });

    return {
      conversationId: resolvedConvoId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantRow.id,
      assistantContent,
      costCents: totalCostCents,
      toolInvocations,
    };
  },
});
