/**
 * Streaming admin chat capability. Same event shape as user streamChatTurn
 * (ChatStreamEvent), but:
 *   - Uses Anthropic provider (Claude Sonnet 4) instead of OpenAI
 *   - Sets is_admin_chat = true on conversation creation
 *   - Loads any admin chat by ID with no per-user restriction — P6 lock:
 *     any admin sees any admin chat
 *   - Tool catalog from buildToolCatalog({ includeAdmin: true })
 *   - currentRoute injected into system prompt for page-aware queries
 *   - Events use 'admin.chat.*' types so they don't conflate with user-
 *     chat events in the activity feed
 *
 * Not registered as a capability — same reason as user streamChatTurn:
 * tRPC mutations don't stream. The SSE endpoint at apps/api calls this
 * generator directly.
 */
import { eq, and, desc, sql as drizzleSql } from 'drizzle-orm';
import { getDb, chatConversations, chatMessages } from '@tela/db';
import { callMulti, callMultiStream, type ChatMessage } from '@tela/ai';
import { logEvent } from '@tela/events';
import { getRequestContext } from '../context/requestContext.js';
import { buildToolCatalog, dispatchTool } from '../chat/toolCatalog.js';
import type { ChatStreamEvent } from '../chat/streamChatTurn.js';

const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_DEPTH = 5;
const ADMIN_MODEL = 'claude-sonnet-4-20250514';
const ADMIN_MAX_TOKENS = 4096;

/**
 * Sentinel prompt version ID for the inline admin system prompt. The
 * generations table requires promptVersionId NOT NULL but has no FK on
 * prompt_versions, so we use the nil UUID rather than seeding a real
 * prompt entry. Follow-up: register admin.system in the prompts table
 * so cofounder can edit it via the admin UI.
 */
const ADMIN_PROMPT_VERSION_ID = '00000000-0000-0000-0000-000000000000';

export interface StreamAdminChatInput {
  conversationId: string | null;
  message: string;
  /**
   * The admin's current page (e.g. '/admin/users/abc123'). Injected
   * into the system prompt so the AI can resolve "this user" / "this
   * page" against the admin's context.
   */
  currentRoute?: string;
}

export async function* streamAdminChat(
  input: StreamAdminChatInput,
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const { userId, source } = getRequestContext();
  const db = getDb();

  // 1. Find or create the admin conversation. Per P6: any admin sees
  // any admin chat — no userId check on lookup. is_admin_chat must be
  // true (defense in depth; the SSE endpoint also gates on isAdmin).
  let resolvedConvoId: string;
  if (input.conversationId) {
    const convo = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.id, input.conversationId),
        eq(chatConversations.isAdminChat, true),
      ),
    });
    if (!convo) throw new Error('Admin conversation not found');
    resolvedConvoId = convo.id;
  } else {
    const [created] = await db
      .insert(chatConversations)
      .values({
        userId, // The admin who started the chat — surfaces in listAdminChats as startedBy
        title: input.message.slice(0, 80),
        messageCount: 0,
        lastMessageAt: new Date(),
        isAdminChat: true,
      })
      .returning({ id: chatConversations.id });
    resolvedConvoId = created.id;

    await logEvent({
      userId,
      type: 'admin.chat.conversation_started',
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

  // 3. Persist user message immediately so it appears even if the AI fails
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
    type: 'admin.chat.message_sent',
    source,
    payload: { conversationId: resolvedConvoId, messageId: userMsg.id },
  });

  yield {
    type: 'user-saved',
    userMessageId: userMsg.id,
    conversationId: resolvedConvoId,
  };

  // 4. Build system prompt + admin tool catalog
  const systemPrompt = buildAdminSystemPrompt(input.currentRoute);
  const tools = buildToolCatalog({ includeAdmin: true });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map<ChatMessage>((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: input.message },
  ];

  // 5. Tool-call loop. Mirrors streamChatTurn's structure; Anthropic
  // returns the assistant turn synchronously and we stream the final
  // text round below if we exit via the depth cap.
  yield { type: 'thinking' };

  const toolInvocations: {
    name: string;
    args: unknown;
    ok: boolean;
    error: string | null;
    result?: unknown;
  }[] = [];
  let totalCostCents = 0;
  let assistantContent: string | null = null;

  for (let depth = 0; depth < MAX_TOOL_DEPTH; depth++) {
    const result = await callMulti({
      operation: 'admin.streamAdminChat',
      userId,
      promptName: 'admin.system',
      promptVersionId: ADMIN_PROMPT_VERSION_ID,
      messages,
      tools,
      model: ADMIN_MODEL,
      maxTokens: ADMIN_MAX_TOKENS,
      temperature: 0.7,
      provider: 'anthropic',
    });
    totalCostCents += result.provenance.costCents;

    const assistantMsg = result.response.message;
    messages.push(assistantMsg);

    if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
      assistantContent = assistantMsg.content ?? '';
      if (assistantContent) {
        yield { type: 'text-delta', content: assistantContent };
      }
      break;
    }

    // Dispatch tool calls in parallel
    const callResults = await Promise.all(
      assistantMsg.toolCalls.map(async (tc) => {
        await logEvent({
          userId,
          type: 'admin.chat.tool_invoked',
          source,
          payload: { conversationId: resolvedConvoId, tool: tc.name },
        });
        return { tc, dispatch: await dispatchTool(tc.name, tc.args) };
      }),
    );

    for (const { tc, dispatch } of callResults) {
      yield { type: 'tool-start', name: tc.name };
      const errorString = dispatch.error
        ? `${dispatch.error.name}: ${dispatch.error.message}`
        : null;
      yield {
        type: 'tool-end',
        name: tc.name,
        ok: dispatch.ok,
        error: errorString,
      };

      toolInvocations.push({
        name: tc.name,
        args: tc.args,
        ok: dispatch.ok,
        error: errorString,
        result: dispatch.ok ? dispatch.result : undefined,
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

    yield { type: 'thinking' };
  }

  // 6. Depth-cap fallback: force a final text turn if we ran out of
  // tool budget without producing assistant text.
  if (assistantContent === null) {
    let streamed = '';
    const finalGen = callMultiStream({
      operation: 'admin.streamAdminChat',
      userId,
      promptName: 'admin.system',
      promptVersionId: ADMIN_PROMPT_VERSION_ID,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'You hit the tool-call depth limit. Reply now in plain text summarizing what you accomplished and what the admin should do next.',
        },
      ],
      model: ADMIN_MODEL,
      maxTokens: ADMIN_MAX_TOKENS,
      temperature: 0.5,
      provider: 'anthropic',
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

  // 7. Persist assistant message + conversation aggregates
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
    type: 'admin.chat.message_received',
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

/**
 * Inline admin system prompt builder. Adapted from the legacy
 * `/Users/lukegorski/ale/src/lib/admin-ai-prompts.ts`. The route
 * matching expands the legacy 3-case list (users / costs / activity)
 * to cover our richer admin surface (chats, rules, examples, prompts).
 * Route patterns assume the new admin keeps the `/admin/*` URL prefix
 * (locked in 14a per phase-14-admin-parity.md URL STRUCTURE).
 */
function buildAdminSystemPrompt(currentRoute?: string): string {
  const today = new Date().toISOString().split('T')[0];

  let routeContext = '';
  if (currentRoute) {
    const userMatch = currentRoute.match(/\/admin\/users\/([^/?]+)/);
    const convoMatch = currentRoute.match(/\/admin\/chats\/([^/?]+)/);
    if (userMatch) {
      routeContext = `\nThe admin is currently viewing user ${userMatch[1]}. If they say "this user" or "them", use this user_id.`;
    } else if (convoMatch) {
      routeContext = `\nThe admin is currently viewing conversation ${convoMatch[1]}. If they say "this conversation" or "this chat", use this conversation_id.`;
    } else if (currentRoute.includes('/admin/costs')) {
      routeContext = '\nThe admin is currently viewing the costs page.';
    } else if (currentRoute.includes('/admin/activity')) {
      routeContext = '\nThe admin is currently viewing the activity log.';
    } else if (currentRoute.includes('/admin/chat')) {
      routeContext = '\nThe admin is currently viewing the chat dashboard.';
    } else if (currentRoute.includes('/admin/users')) {
      routeContext = '\nThe admin is currently viewing the user list.';
    } else if (currentRoute.includes('/admin/rules')) {
      routeContext = '\nThe admin is currently viewing stylist rules.';
    } else if (currentRoute.includes('/admin/examples')) {
      routeContext = '\nThe admin is currently viewing annotated examples.';
    } else if (currentRoute.includes('/admin/prompts')) {
      routeContext = '\nThe admin is currently viewing prompt versions.';
    }
  }

  return `You are the admin assistant for **tela**, an AI-powered personal styling app. You help the cofounders understand their data and monitor the business.

## What tela does
Users upload photos of their clothing → AI analyzes each item (category, color, pattern, style, material) → Users request outfit suggestions for occasions → AI generates outfits from their wardrobe → Users can try on outfits virtually → Users chat with an AI stylist for personalized advice.

## Data you have access to (via tools)
- **Users**: profiles with style preferences, body info, locale, onboarding state, admin flag
- **Wardrobe items**: clothing metadata (category, color, pattern, style, formality, material)
- **Outfits**: generated outfit combinations with feedback, saved status, try-on status
- **User chats**: conversations between users and the AI stylist (per-conversation transcripts with per-turn cost + model)
- **Activity log**: user-actions feed (item uploads, outfit generation, onboarding, etc.) ordered newest first
- **Usage costs**: per-operation costs across OpenAI, Fashn, Anthropic. Global aggregates + per-user breakdowns.
- **Stylist content**: rules, annotated examples, and prompt versions (read-only via this chat)

## How to work
- Always use tools to get data. Never guess or make up numbers.
- Be concise. Use tables or bullet points for lists.
- Format numbers nicely (e.g., "$1.23", "1,234 items").
- Use relative dates when helpful ("3 days ago") but include the actual date too.
- When answering "how many" or "who" questions, call the appropriate tool first.
- When the admin says "this user" / "them" / "this conversation" — use the route context below (if any) to resolve which entity they mean.

## Today's date
${today}${routeContext}`;
}
