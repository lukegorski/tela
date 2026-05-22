'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { usePathname } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { waitForToken } from '@/lib/auth-token-store';
import { ClaudeIcon } from './ClaudeIcon';

// SSE wire shape — mirrors packages/capabilities/src/chat/streamChatTurn.ts
// ChatStreamEvent. admin.streamAdminChat yields the same event types.
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
      toolInvocations: ToolCall[];
    }
  | { type: 'error'; message: string };

interface ToolCall {
  name: string;
  args: unknown;
  ok: boolean;
  error: string | null;
  result?: unknown;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: ToolCall[] | null;
  costCents: number | null;
  model: string | null;
  createdAt: string;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  messageCount: number;
  chatCostCents: number;
  createdAt: string;
  lastMessageAt: string | null;
  startedBy: {
    userId: string;
    email: string | null;
    displayName: string | null;
  };
}

interface ListResult {
  conversations: ConversationSummary[];
  hasMore: boolean;
}

interface ConversationDetailResult {
  conversation: {
    id: string;
    title: string | null;
    userId: string;
    email: string | null;
    displayName: string | null;
    messageCount: number;
    chatCostCents: number;
    createdAt: string;
    lastMessageAt: string | null;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    toolCalls: ToolCall[] | null;
    generationId: string | null;
    costCents: number | null;
    model: string | null;
    createdAt: string;
  }>;
}

const SIDEBAR_PAGE_SIZE = 30;

// Persisted across AdminAiChat instances so the panel (variant="panel"),
// the full-page (/admin/ai variant="page"), and post-reload state all
// share the same active conversation. Writes happen on user-saved (new
// chat) + sidebar selection; cleared on "+ New chat". Mirrors the legacy
// admin chat's persistence semantics.
const ACTIVE_CONVO_KEY = 'adminAiActiveConversationId';

const SUGGESTED_PROMPTS = [
  'How many users do we have?',
  "What's our total API cost this month?",
  'Who signed up most recently?',
  'Show me today’s activity',
];

// Buffer-aware SSE reader — yields one parsed event per complete `data:`
// frame. Lifted from apps/web's useChat.ts; same SSE format on the wire.
async function* readSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
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
          // Skip malformed events; the stream stays open.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export interface AdminAiChatProps {
  variant: 'panel' | 'page';
}

export function AdminAiChat({ variant }: AdminAiChatProps) {
  const pathname = usePathname();

  // currentRoute injected into the system prompt so the AI can resolve
  // "this user" / "this page" against the admin's context. Stripped of
  // any potential locale prefix for clean matching against /admin/* paths.
  const currentRoute = useMemo(
    () => pathname?.replace(/^\/[a-z]{2}(?=\/)/, '') ?? '/admin',
    [pathname],
  );

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<{
    isStreaming: boolean;
    streamedText: string;
    activeToolName: string | null;
    completedTools: ToolCall[];
  }>({
    isStreaming: false,
    streamedText: '',
    activeToolName: null,
    completedTools: [],
  });
  const [error, setError] = useState<string | null>(null);
  // Mobile / panel toggle between chat view and history view. Default
  // false (chat view) so a new admin lands on the composer. Page variant
  // on desktop ignores this — both panes are visible side-by-side.
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = trpc.capability.execute.useMutation();
  const executeRef = useRef(execute);
  executeRef.current = execute;

  // Initial load: fetch admin chat sidebar AND (if any) auto-load the
  // active conversation from localStorage so panel + page + reload all
  // resume the same thread.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = (await executeRef.current.mutateAsync({
          name: 'admin.listAdminChats',
          input: { limit: SIDEBAR_PAGE_SIZE, offset: 0 },
        })) as ListResult;
        if (cancelled) return;
        setConversations(result.conversations);
        setHasMore(result.hasMore);

        const stored = window.localStorage.getItem(ACTIVE_CONVO_KEY);
        if (
          stored &&
          result.conversations.some((c) => c.id === stored)
        ) {
          // Defensive existence check — if the stored id is stale (chat
          // deleted, different DB), getConversation would throw. Confirm
          // it's in the visible sidebar before auto-loading.
          setConversationId(stored);
          setLoadingHistory(true);
          try {
            const convo = (await executeRef.current.mutateAsync({
              name: 'admin.getConversation',
              input: { conversationId: stored },
            })) as ConversationDetailResult;
            if (cancelled) return;
            setMessages(
              convo.messages.map((m) => ({
                id: m.id,
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content,
                toolCalls: m.toolCalls ?? null,
                costCents: m.costCents,
                model: m.model,
                createdAt: m.createdAt,
              })),
            );
          } finally {
            if (!cancelled) setLoadingHistory(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load admin chats',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cancel any in-flight stream when the component unmounts so navigation
  // away doesn't leave the SSE call orphaned.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-scroll on message changes / streaming text.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming.streamedText, streaming.activeToolName]);

  // Auto-resize textarea (capped at ~5 lines).
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
  }, [input]);

  // Load a specific conversation's transcript.
  const loadConversation = useCallback(async (id: string) => {
    setError(null);
    setLoadingHistory(true);
    setConversationId(id);
    window.localStorage.setItem(ACTIVE_CONVO_KEY, id);
    setMessages([]);
    try {
      const result = (await executeRef.current.mutateAsync({
        name: 'admin.getConversation',
        input: { conversationId: id },
      })) as ConversationDetailResult;
      setMessages(
        result.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          toolCalls: m.toolCalls ?? null,
          costCents: m.costCents,
          model: m.model,
          createdAt: m.createdAt,
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load conversation',
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Start a new conversation: clear active id, clear messages. Server will
  // mint a fresh conversation on first send.
  const startNew = useCallback(() => {
    if (streaming.isStreaming) return;
    setConversationId(null);
    window.localStorage.removeItem(ACTIVE_CONVO_KEY);
    setMessages([]);
    setError(null);
    setIsHistoryOpen(false);
  }, [streaming.isStreaming]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    try {
      const result = (await executeRef.current.mutateAsync({
        name: 'admin.listAdminChats',
        input: { limit: SIDEBAR_PAGE_SIZE, offset: conversations.length },
      })) as ListResult;
      setConversations((prev) => [...prev, ...result.conversations]);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load more chats',
      );
    }
  }, [hasMore, conversations.length]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming.isStreaming) return;

      setError(null);
      setInput('');
      const tempUserId = `optimistic-${Date.now()}`;
      const optimisticUser: ChatMessage = {
        id: tempUserId,
        role: 'user',
        content: trimmed,
        toolCalls: null,
        costCents: null,
        model: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);
      setStreaming({
        isStreaming: true,
        streamedText: '',
        activeToolName: null,
        completedTools: [],
      });

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const token = await waitForToken();
        if (!token) throw new Error('Not signed in');

        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) throw new Error('NEXT_PUBLIC_API_URL not configured');

        const response = await fetch(`${apiUrl}/admin/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            conversationId,
            message: trimmed,
            currentRoute,
          }),
          signal: abort.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = `Request failed (${response.status})`;
          try {
            const errJson = JSON.parse(errText) as { error?: string };
            if (errJson.error) errMsg = errJson.error;
          } catch {
            errMsg = errText.slice(0, 200) || errMsg;
          }
          throw new Error(errMsg);
        }
        if (!response.body) throw new Error('Empty response body');

        for await (const event of readSseStream(response.body)) {
          switch (event.type) {
            case 'user-saved':
              setConversationId(event.conversationId);
              window.localStorage.setItem(
                ACTIVE_CONVO_KEY,
                event.conversationId,
              );
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempUserId ? { ...m, id: event.userMessageId } : m,
                ),
              );
              break;

            case 'thinking':
              setStreaming((s) => ({ ...s, activeToolName: null }));
              break;

            case 'tool-start':
              setStreaming((s) => ({ ...s, activeToolName: event.name }));
              break;

            case 'tool-end':
              // Move the tool from "active" to "completed" so the streaming
              // bubble shows the running history of what's been called.
              setStreaming((s) => ({
                ...s,
                activeToolName: null,
                completedTools: [
                  ...s.completedTools,
                  {
                    name: event.name,
                    args: null,
                    ok: event.ok,
                    error: event.error,
                  },
                ],
              }));
              break;

            case 'text-delta':
              setStreaming((s) => ({
                ...s,
                streamedText: s.streamedText + event.content,
                activeToolName: null,
              }));
              break;

            case 'done':
              setMessages((prev) => [
                ...prev,
                {
                  id: event.assistantMessageId,
                  role: 'assistant',
                  content: event.assistantContent,
                  toolCalls:
                    event.toolInvocations.length > 0
                      ? event.toolInvocations
                      : null,
                  costCents: event.costCents,
                  // Model isn't yielded in `done`; transcript fetch will hydrate
                  // on next conversation load. Current turn shows '—'.
                  model: null,
                  createdAt: new Date().toISOString(),
                },
              ]);
              setStreaming({
                isStreaming: false,
                streamedText: '',
                activeToolName: null,
                completedTools: [],
              });
              // Refresh sidebar to bump this conversation to the top + update
              // count/cost/lastMessageAt. Don't block; UI can lag a moment.
              executeRef.current
                .mutateAsync({
                  name: 'admin.listAdminChats',
                  input: { limit: SIDEBAR_PAGE_SIZE, offset: 0 },
                })
                .then((r) => {
                  const list = r as ListResult;
                  setConversations(list.conversations);
                  setHasMore(list.hasMore);
                })
                .catch(() => {
                  /* sidebar refresh is best-effort */
                });
              break;

            case 'error':
              throw new Error(event.message);
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === 'AbortError') {
          // User canceled — drop the optimistic message.
          setMessages((prev) => prev.filter((m) => m.id !== tempUserId));
        } else {
          // Common iOS Safari case: tab backgrounded mid-stream → connection
          // closes. Surface clearly so the admin can retry.
          setError(e.message || 'Connection lost — please try again.');
          setMessages((prev) => prev.filter((m) => m.id !== tempUserId));
        }
        setStreaming({
          isStreaming: false,
          streamedText: '',
          activeToolName: null,
          completedTools: [],
        });
      } finally {
        abortRef.current = null;
      }
    },
    [conversationId, currentRoute, streaming.isStreaming],
  );

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const isPanel = variant === 'panel';
  const isEmpty = messages.length === 0 && !streaming.isStreaming;

  // Layout:
  //   - panel: 1-column. History view OR chat view (toggle).
  //   - page (desktop md+): 2-column. Sidebar always visible, main fills.
  //   - page (mobile): 1-column. History view OR chat view (toggle).
  // The chat pane is conditionally hidden via Tailwind based on isHistoryOpen
  // for the 1-column cases.

  return (
    <div
      className={`flex w-full ${
        isPanel ? 'h-full' : 'h-[calc(100dvh-3.5rem)]'
      }`}
    >
      {/* Sidebar */}
      <aside
        className={`
          flex-col bg-white dark:bg-neutral-900 border-r border-stone-200 dark:border-neutral-800
          ${isPanel ? 'w-full' : 'w-full md:w-[280px] md:flex-shrink-0'}
          ${
            isHistoryOpen
              ? 'flex'
              : isPanel
                ? 'hidden'
                : 'hidden md:flex'
          }
        `}
      >
        <SidebarHeader
          isPanel={isPanel}
          onBackToChat={() => setIsHistoryOpen(false)}
        />
        <ConversationList
          conversations={conversations}
          activeId={conversationId}
          hasMore={hasMore}
          onSelect={(id) => {
            void loadConversation(id);
            setIsHistoryOpen(false);
          }}
          onLoadMore={() => void loadMore()}
          onStartNew={startNew}
        />
      </aside>

      {/* Main chat pane */}
      <section
        className={`
          flex-1 flex-col bg-white dark:bg-neutral-900 min-w-0
          ${
            isHistoryOpen
              ? isPanel
                ? 'hidden'
                : 'hidden md:flex'
              : 'flex'
          }
        `}
      >
        <ChatHeader
          isPanel={isPanel}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onStartNew={startNew}
          canStartNew={!streaming.isStreaming && messages.length > 0}
        />

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingHistory ? (
            <p className="text-xs text-stone-400 italic text-center py-8">
              Loading transcript...
            </p>
          ) : isEmpty ? (
            <EmptyState onPick={(p) => void sendMessage(p)} />
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {streaming.isStreaming && (
                <StreamingBubble
                  streamedText={streaming.streamedText}
                  activeToolName={streaming.activeToolName}
                  completedTools={streaming.completedTools}
                />
              )}
            </>
          )}
          {error && (
            <div className="px-3 py-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-none border-t border-stone-200 dark:border-neutral-800 p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data..."
              disabled={streaming.isStreaming}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 outline-none border border-stone-200 dark:border-neutral-700 px-3 py-2 disabled:opacity-50 min-h-[44px]"
              style={{ maxHeight: 112 }}
            />
            <button
              type="submit"
              disabled={streaming.isStreaming || !input.trim()}
              className="px-3 py-2 bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 text-sm font-medium disabled:opacity-30 active:scale-[0.98] transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Send"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  d="M22 2L11 13"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 2L15 22L11 13L2 9L22 2Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────

function ChatHeader({
  isPanel,
  onOpenHistory,
  onStartNew,
  canStartNew,
}: {
  isPanel: boolean;
  onOpenHistory: () => void;
  onStartNew: () => void;
  canStartNew: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-neutral-800 flex-none">
      <button
        onClick={onOpenHistory}
        className={`text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 ${
          isPanel ? '' : 'md:hidden'
        }`}
        aria-label="Open chat history"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      </button>
      <div className="flex items-center gap-2">
        <ClaudeIcon className="w-4 h-4 text-[#d97757]" />
        <span className="text-xs font-semibold tracking-widest uppercase text-stone-500 dark:text-stone-400">
          Assistant
        </span>
      </div>
      <button
        onClick={onStartNew}
        disabled={!canStartNew}
        className="text-xs text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-300 disabled:opacity-30 transition-colors"
      >
        New
      </button>
    </div>
  );
}

function SidebarHeader({
  isPanel,
  onBackToChat,
}: {
  isPanel: boolean;
  onBackToChat: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-neutral-800 flex-none ${
        isPanel ? '' : 'md:px-3'
      }`}
    >
      <button
        onClick={onBackToChat}
        className={`text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 ${
          isPanel ? '' : 'md:hidden'
        }`}
        aria-label="Back to chat"
      >
        ← Back
      </button>
      <span className="text-xs font-semibold tracking-widest uppercase text-stone-500 dark:text-stone-400">
        Recent chats
      </span>
      <span className="w-8" />
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  hasMore,
  onSelect,
  onLoadMore,
  onStartNew,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  hasMore: boolean;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onStartNew: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <button
        onClick={onStartNew}
        className="w-full text-left px-4 py-3 text-xs uppercase tracking-widest font-semibold text-stone-500 hover:text-stone-800 hover:bg-stone-50 dark:hover:bg-neutral-800 transition-colors border-b border-stone-100 dark:border-neutral-800 min-h-[44px]"
      >
        + New chat
      </button>
      {conversations.length === 0 ? (
        <p className="px-4 py-6 text-xs text-stone-400 italic">
          No admin chats yet.
        </p>
      ) : (
        <ul>
          {conversations.map((c) => {
            const isActive = c.id === activeId;
            const by = c.startedBy.displayName ?? c.startedBy.email ?? '—';
            const label = c.title?.trim() || '(untitled)';
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-stone-100 dark:border-neutral-800 transition-colors min-h-[44px] ${
                    isActive
                      ? 'bg-stone-100 dark:bg-neutral-800'
                      : 'hover:bg-stone-50 dark:hover:bg-neutral-800/60'
                  }`}
                >
                  <p className="text-sm text-stone-800 dark:text-stone-200 line-clamp-2 leading-snug">
                    {label}
                  </p>
                  <p className="mt-1 text-[11px] text-stone-400 font-mono">
                    {by} · {formatRelativeTime(c.lastMessageAt ?? c.createdAt)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full px-4 py-3 text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <ClaudeIcon className="w-8 h-8 text-[#d97757]" />
        <p className="text-sm text-stone-500 dark:text-stone-400">
          No admin chats yet — start one below.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-md">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="text-left px-3 py-3 text-sm text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-neutral-700 hover:bg-stone-50 dark:hover:bg-neutral-800 transition-colors min-h-[44px]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] flex flex-col gap-1.5">
        {!isUser && (message.model || message.costCents != null) && (
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-400 font-mono normal-case">
            {message.model && <span>{message.model}</span>}
            {message.costCents != null && (
              <span>· {formatCents(message.costCents)}</span>
            )}
          </div>
        )}
        {message.content && (
          <div
            className={`px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              isUser
                ? 'bg-stone-700 dark:bg-stone-600 text-stone-50'
                : 'bg-stone-100 dark:bg-neutral-800 text-stone-800 dark:text-stone-200'
            }`}
          >
            {message.content}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ul className="space-y-1">
            {message.toolCalls.map((tc, idx) => (
              <li
                key={`${message.id}-tool-${idx}`}
                className={`text-[11px] px-2.5 py-1.5 border ${
                  tc.ok
                    ? 'border-stone-200 bg-stone-50 text-stone-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-400'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                <p className="font-mono">
                  {tc.ok ? '✓' : '✗'} {tc.name}
                  {tc.error && (
                    <span className="text-red-600 dark:text-red-400">
                      {' '}
                      — {tc.error}
                    </span>
                  )}
                </p>
                {tc.args !== null && tc.args !== undefined ? (
                  <pre className="mt-0.5 text-stone-500 dark:text-stone-500 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(tc.args, null, 0)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StreamingBubble({
  streamedText,
  activeToolName,
  completedTools,
}: {
  streamedText: string;
  activeToolName: string | null;
  completedTools: ToolCall[];
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] flex flex-col gap-1.5">
        {/* Completed tool history during this turn */}
        {completedTools.length > 0 && (
          <ul className="space-y-1">
            {completedTools.map((tc, idx) => (
              <li
                key={`streaming-tool-${idx}`}
                className={`text-[11px] px-2.5 py-1.5 border ${
                  tc.ok
                    ? 'border-stone-200 bg-stone-50 text-stone-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-400'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                <p className="font-mono">
                  {tc.ok ? '✓' : '✗'} {tc.name}
                  {tc.error && (
                    <span className="text-red-600 dark:text-red-400">
                      {' '}
                      — {tc.error}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Active tool spinner card */}
        {activeToolName && (
          <div className="flex items-center gap-2 text-[11px] px-2.5 py-1.5 border border-stone-200 bg-stone-50 text-stone-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-400">
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-25"
              />
              <path
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                fill="currentColor"
                className="opacity-75"
              />
            </svg>
            <span className="font-mono">Calling {activeToolName}...</span>
          </div>
        )}

        {/* Streaming text bubble (or thinking dots when nothing yet) */}
        <div className="bg-stone-100 dark:bg-neutral-800 text-stone-800 dark:text-stone-200 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {streamedText || (
            <span className="inline-flex gap-1">
              <span
                className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCents(cents: number): string {
  if (cents === 0) return '$0';
  if (cents < 1) return `$${cents.toFixed(4)}`;
  if (cents < 100) return `$${(cents / 100).toFixed(4)}`;
  return `$${(cents / 100).toFixed(2)}`;
}
