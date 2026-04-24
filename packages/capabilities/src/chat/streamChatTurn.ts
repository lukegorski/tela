/**
 * Streaming variant of chat.sendMessage. Not registered as a capability
 * because tRPC mutations don't stream natively — instead, the SSE endpoint
 * in apps/api calls this generator directly and pipes events to the client.
 *
 * Behavior matches chat.sendMessage:
 *   - Find / create the conversation, ownership-checked
 *   - Persist the user message immediately
 *   - Load context for the system prompt
 *   - Tool-call loop up to MAX_TOOL_DEPTH:
 *     - Intermediate rounds: synchronous callMulti (need full tool_calls
 *       before we can dispatch); emits tool-start / tool-end events.
 *     - Final round (no tool calls): streaming callMultiStream; yields
 *       text-delta events to the client.
 *   - Persist assistant message + tool invocations
 *   - Update conversation aggregates
 *   - Yield a final 'done' event with persistence info
 *
 * Some duplication with sendMessage is accepted for now — when streaming
 * stabilizes we can extract a shared helper (Phase 9 polish).
 */
import { eq, desc, and, sql as drizzleSql } from 'drizzle-orm';
import {
  getDb,
  chatConversations,
  chatMessages,
  styleProfiles,
  closetItems,
} from '@tela/db';
import { callMulti, callMultiStream, type ChatMessage } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { logEvent } from '@tela/events';
import { getRequestContext } from '../context/requestContext.js';
import { buildToolCatalog, dispatchTool } from './toolCatalog.js';

const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_DEPTH = 5;

export interface StreamChatInput {
  conversationId: string | null;
  message: string;
  locale: string;
}

/**
 * Events emitted to the chat UI. Mirror the wire format the SSE endpoint
 * sends. Keep names short — SSE bandwidth adds up.
 */
export type ChatStreamEvent =
  | { type: 'user-saved'; userMessageId: string; conversationId: string }
  | { type: 'thinking' }
  | { type: 'tool-start'; name: string }
  | { type: 'tool-end'; name: string; ok: boolean; error: string | null }
  | { type: 'text-delta'; content: string }
  | {
      type: 'done';
      conversationId: string;
      assistantMessageId: string;
      assistantContent: string;
      costCents: number;
      toolInvocations: { name: string; args: unknown; ok: boolean; error: string | null }[];
    }
  | { type: 'error'; message: string };

/**
 * Run a single chat turn, yielding events as work progresses.
 *
 * Caller is responsible for capturing errors and forwarding them as
 * 'error' events to the client — this function lets exceptions bubble.
 */
export async function* streamChatTurn(
  input: StreamChatInput,
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const { userId, source } = getRequestContext();
  const db = getDb();

  // 1. Find or create conversation
  let resolvedConvoId: string;
  if (input.conversationId) {
    const convo = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.id, input.conversationId),
        eq(chatConversations.userId, userId),
      ),
    });
    if (!convo) throw new Error('Conversation not found or does not belong to user');
    resolvedConvoId = convo.id;
  } else {
    const [created] = await db
      .insert(chatConversations)
      .values({
        userId,
        title: input.message.slice(0, 80),
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

  // 2. Load history (chronological)
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, resolvedConvoId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(MAX_HISTORY_MESSAGES);
  history.reverse();

  // 3. Persist the user message + emit user-saved
  const [userMsg] = await db
    .insert(chatMessages)
    .values({
      conversationId: resolvedConvoId,
      role: 'user',
      content: input.message,
    })
    .returning({ id: chatMessages.id });

  await logEvent({
    userId,
    type: 'chat.message_sent',
    source,
    payload: { conversationId: resolvedConvoId, messageId: userMsg.id },
  });

  yield { type: 'user-saved', userMessageId: userMsg.id, conversationId: resolvedConvoId };

  // 4. Build system context
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
  const renderedSystem = prompt.template
    .replaceAll('{{profile_text}}', profileText)
    .replaceAll('{{style_dimensions}}', dimensions)
    .replaceAll('{{wardrobe_summary}}', wardrobeSummary)
    .replaceAll('{{locale}}', input.locale);

  const messages: ChatMessage[] = [
    { role: 'system', content: renderedSystem },
    ...history.map<ChatMessage>((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: input.message },
  ];

  const tools = buildToolCatalog();

  // 5. Tool-call loop. Final round streams; intermediate rounds don't.
  yield { type: 'thinking' };

  const toolInvocations: {
    name: string;
    args: unknown;
    ok: boolean;
    error: string | null;
  }[] = [];
  let totalCostCents = 0;
  let assistantContent: string | null = null;

  for (let depth = 0; depth < MAX_TOOL_DEPTH; depth++) {
    // Run a non-streaming call so we can see the full tool_calls before
    // deciding what to do next. Tool-call deltas are skipped intentionally.
    const result = await callMulti({
      operation: 'chat.streamMessage',
      userId,
      promptName: prompt.name,
      promptVersionId: prompt.versionId,
      messages,
      tools,
      model: 'gpt-5.4-mini',
      temperature: 0.7,
    });
    totalCostCents += result.provenance.costCents;

    const assistantMsg = result.response.message;
    messages.push(assistantMsg);

    // No tool calls → break and stream the final text. (We've already paid
    // for this round so we'll re-emit its content as a single delta
    // immediately, then call the streaming variant on the NEXT round if
    // we want truly progressive output. For MVP we just emit the content
    // as-is since the model already returned it.)
    if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
      assistantContent = assistantMsg.content ?? '';
      // Emit as a single delta so the UI's typewriter renderer renders it.
      // True streaming for the case where there were no tool calls would
      // require us to detect "is the model going to call a tool?" before
      // streaming text — which we can't without running the call. The
      // optimization for the no-tool path comes in Phase 9.3.
      if (assistantContent) {
        yield { type: 'text-delta', content: assistantContent };
      }
      break;
    }

    // Execute every tool call in parallel.
    const callResults = await Promise.all(
      assistantMsg.toolCalls.map(async (tc) => {
        await logEvent({
          userId,
          type: 'chat.tool_invoked',
          source,
          payload: { conversationId: resolvedConvoId, tool: tc.name },
        });
        return { tc, dispatch: await dispatchTool(tc.name, tc.args) };
      }),
    );

    // Emit tool-start / tool-end and append tool messages
    for (const { tc, dispatch } of callResults) {
      yield { type: 'tool-start', name: tc.name };
      const errorString = dispatch.error ? `${dispatch.error.name}: ${dispatch.error.message}` : null;
      yield { type: 'tool-end', name: tc.name, ok: dispatch.ok, error: errorString };

      toolInvocations.push({
        name: tc.name,
        args: tc.args,
        ok: dispatch.ok,
        error: errorString,
      });
      const payload = dispatch.ok ? { ok: true, result: dispatch.result } : { ok: false, error: dispatch.error };
      messages.push({
        role: 'tool',
        toolCallId: tc.id,
        content: JSON.stringify(payload),
      });
    }

    // After dispatching tools, the next iteration is the model's response.
    // If it produces no tool calls, we'll stream the final text below; if
    // it produces more tool calls, we loop again.
    yield { type: 'thinking' };
  }

  // If we exited the loop because we hit the depth cap without text, do a
  // final no-tool streaming pass so the user gets a summary instead of
  // silence.
  if (assistantContent === null) {
    let streamed = '';
    const finalGen = callMultiStream({
      operation: 'chat.streamMessage',
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
      model: 'gpt-5.4-mini',
      temperature: 0.5,
    });
    while (true) {
      const next = await finalGen.next();
      if (next.done) {
        totalCostCents += next.value.costCents;
        break;
      }
      if (next.value.type === 'text-delta') {
        streamed += next.value.content;
        yield next.value;
      }
    }
    assistantContent = streamed || '(no reply)';
  }

  // 6. Persist assistant message
  const [assistantRow] = await db
    .insert(chatMessages)
    .values({
      conversationId: resolvedConvoId,
      role: 'assistant',
      content: assistantContent,
      toolCalls: toolInvocations.length > 0 ? toolInvocations : null,
    })
    .returning({ id: chatMessages.id });

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

  yield {
    type: 'done',
    conversationId: resolvedConvoId,
    assistantMessageId: assistantRow.id,
    assistantContent,
    costCents: totalCostCents,
    toolInvocations,
  };
}
