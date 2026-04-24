'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface ToolInvocation {
  name: string;
  args: unknown;
  ok: boolean;
  error: string | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  toolInvocations?: ToolInvocation[] | null;
  /** Set on the in-flight assistant message to surface "currently working on" indicators. */
  pendingTool?: string | null;
}

interface Props {
  conversationId: string | null;
  initialMessages: Message[];
  lang: string;
}

/**
 * SSE stream event shapes — must match
 * packages/capabilities/src/chat/streamChatTurn.ts. Kept inline rather than
 * imported because @tela/capabilities pulls server-only deps.
 */
type StreamEvent =
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
      toolInvocations: ToolInvocation[];
    }
  | { type: 'error'; message: string };

/**
 * Read an SSE response body and yield each parsed event. Buffers across
 * network chunks; only emits whole events.
 */
async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const dataLines: string[] = [];
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length === 0) continue;
        try {
          yield JSON.parse(dataLines.join('\n')) as StreamEvent;
        } catch {
          // Ignore malformed events; stream stays open.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function ChatComposer({ conversationId, initialMessages, lang }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [activeConvoId, setActiveConvoId] = useState<string | null>(conversationId);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || streaming) return;

    const text = draft.trim();
    setDraft('');
    setStreaming(true);

    // Stable temp IDs we'll use throughout this turn
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const accumulatedTools: ToolInvocation[] = [];

    // Optimistic user message + empty assistant placeholder for the
    // streaming text to write into
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: text, createdAt: new Date().toISOString() },
      {
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        toolInvocations: [],
        pendingTool: null,
      },
    ]);

    try {
      // Get the auth token + API URL the same way the tRPC client does
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error('NEXT_PUBLIC_API_URL not configured');

      const response = await fetch(`${apiUrl}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          conversationId: activeConvoId,
          message: text,
          locale: lang,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 200)}`);
      }
      if (!response.body) throw new Error('Empty response body');

      // Drain the stream, mutating the in-flight assistant message
      for await (const event of readSseStream(response.body)) {
        switch (event.type) {
          case 'user-saved':
            setActiveConvoId(event.conversationId);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempUserId
                  ? { ...m, id: event.userMessageId }
                  : m,
              ),
            );
            break;

          case 'thinking':
            setMessages((prev) =>
              prev.map((m) => (m.id === tempAssistantId ? { ...m, pendingTool: 'thinking' } : m)),
            );
            break;

          case 'tool-start':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, pendingTool: event.name } : m,
              ),
            );
            break;

          case 'tool-end':
            accumulatedTools.push({
              name: event.name,
              args: undefined,
              ok: event.ok,
              error: event.error,
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? { ...m, toolInvocations: [...accumulatedTools], pendingTool: null }
                  : m,
              ),
            );
            break;

          case 'text-delta':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? { ...m, content: m.content + event.content, pendingTool: null }
                  : m,
              ),
            );
            break;

          case 'done':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? {
                      ...m,
                      id: event.assistantMessageId,
                      content: event.assistantContent,
                      toolInvocations: event.toolInvocations,
                      pendingTool: null,
                    }
                  : m,
              ),
            );
            // Refresh so the URL/conversation list picks up new state
            if (!conversationId) {
              router.refresh();
            }
            break;

          case 'error':
            throw new Error(event.message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempAssistantId),
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${msg}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-3.5rem)] max-w-3xl mx-auto">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <p className="text-sm">Ask tela about your wardrobe.</p>
            <p className="text-xs mt-2 text-stone-400">
              Try: &quot;What should I wear today?&quot; or &quot;Any ideas for date night?&quot;
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              toolInvocations={m.toolInvocations ?? null}
              pendingTool={m.pendingTool ?? null}
            />
          ))
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-stone-200 px-4 sm:px-6 py-3 flex items-end gap-2 bg-white"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder="Ask tela…"
          rows={1}
          className="flex-1 resize-none px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400 max-h-32"
        />
        <button
          type="submit"
          disabled={!draft.trim() || streaming}
          className="px-4 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 disabled:opacity-50 transition-colors"
        >
          {streaming ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

/**
 * Friendly description of what a tool call did. Tries to surface enough
 * detail that the user understands the action without dumping raw JSON.
 * Falls back to the capability name when we don't have a special case.
 */
function describeToolCall(inv: ToolInvocation): string {
  switch (inv.name) {
    case 'wardrobe.listItems':
      return 'Looked through your wardrobe';
    case 'wardrobe.getItem':
      return 'Looked at a specific piece';
    case 'wardrobe.removeItem':
      return 'Removed an item from your closet';
    case 'outfit.generate':
      return 'Generated outfit suggestions';
    case 'outfit.list':
      return 'Looked at your outfit history';
    case 'outfit.get':
      return 'Looked at an outfit in detail';
    case 'outfit.save':
      return 'Saved an outfit to your lookbook';
    case 'outfit.delete':
      return 'Deleted an outfit';
    case 'profile.get':
      return 'Reviewed your style profile';
    case 'profile.closetRead':
      return 'Refreshed your style profile';
    case 'context.assemble':
      return 'Checked the time / season / occasion';
    default:
      return inv.name;
  }
}

function ToolInvocationList({ invocations }: { invocations: ToolInvocation[] }) {
  if (invocations.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5">
      {invocations.map((inv, i) => (
        <li
          key={i}
          className={`text-[11px] flex items-center gap-1.5 ${
            inv.ok ? 'text-stone-400' : 'text-red-500'
          }`}
        >
          <span aria-hidden="true">{inv.ok ? '✓' : '!'}</span>
          <span>{describeToolCall(inv)}</span>
          {!inv.ok && inv.error && (
            <span className="text-red-400 italic" title={inv.error}>
              ({inv.error})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Friendly "currently doing X…" copy for the streaming pendingTool indicator. */
function describePendingTool(name: string): string {
  if (name === 'thinking') return 'Thinking…';
  // Reuse the same labels as the completed-tool list, lowercased + "…"
  return describeToolCall({ name, args: undefined, ok: true, error: null }).replace(/^./, (c) =>
    c.toLowerCase(),
  ) + '…';
}

function MessageBubble({
  role,
  content,
  toolInvocations,
  pendingTool,
}: {
  role: string;
  content: string;
  toolInvocations: ToolInvocation[] | null;
  pendingTool: string | null;
}) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="inline-block px-3 py-1 text-xs text-stone-500 bg-stone-100">
          {content}
        </span>
      </div>
    );
  }

  // Streaming-in assistant message that hasn't received text yet — show
  // either the active tool name or a generic thinking indicator.
  const showPlaceholder = !isUser && content.length === 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser ? 'bg-stone-700 text-stone-50' : 'bg-stone-100 text-stone-900'
        }`}
      >
        {showPlaceholder ? (
          <span className="text-stone-500 italic">
            {pendingTool ? describePendingTool(pendingTool) : 'Thinking…'}
          </span>
        ) : (
          content
        )}
        {!isUser && toolInvocations && toolInvocations.length > 0 && (
          <ToolInvocationList invocations={toolInvocations} />
        )}
        {!isUser && content.length > 0 && pendingTool && (
          <p className="mt-2 text-[11px] text-stone-400 italic">{describePendingTool(pendingTool)}</p>
        )}
      </div>
    </div>
  );
}
