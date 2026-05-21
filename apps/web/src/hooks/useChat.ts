"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/trpc/client";
import { waitForToken } from "@/lib/auth-token-store";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import type { ComposerAttachment } from "@/components/ChatComposer";

/**
 * Tool invocation captured during a chat turn. The optional `result` is
 * the capability's return value when the call succeeded — drives chat
 * rich-card rendering (ChatOutfitGrid, ChatItemGrid) on the page.
 */
export interface ChatToolInvocation {
  name: string;
  args: unknown;
  ok: boolean;
  error: string | null;
  result?: unknown;
}

/**
 * Server-stored attachment shape: photoId / itemId references only.
 * Server resolves to URLs / descriptions inside `streamChatTurn` per
 * locked decision (D5).
 */
export type ChatAttachmentRef =
  | { type: "image"; photoId: string }
  | { type: "wardrobe_item"; itemId: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string | Date;
  toolInvocations: ChatToolInvocation[] | null;
  attachments: ChatAttachmentRef[] | null;
}

export interface StreamingState {
  isStreaming: boolean;
  streamedText: string;
  activeToolName: string | null;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  streaming: StreamingState;
  hasMore: boolean;
  error: string | null;
  sendMessage: (text: string, attachments?: ComposerAttachment[]) => Promise<void>;
  loadMore: () => Promise<void>;
  cancelStream: () => void;
  clearError: () => void;
}

/** SSE wire shape — must mirror packages/capabilities/src/chat/streamChatTurn.ts */
type StreamEvent =
  | { type: "user-saved"; userMessageId: string; conversationId: string }
  | { type: "thinking" }
  | { type: "tool-start"; name: string }
  | { type: "tool-end"; name: string; ok: boolean; error: string | null }
  | { type: "text-delta"; content: string }
  | {
      type: "done";
      conversationId: string;
      assistantMessageId: string;
      assistantContent: string;
      costCents: number;
      toolInvocations: ChatToolInvocation[];
    }
  | { type: "error"; message: string };

interface ServerConversation {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
    toolInvocations: ChatToolInvocation[] | null;
    attachments: ChatAttachmentRef[] | null;
  }>;
  hasMore: boolean;
}

const PAGE_SIZE = 50;

function toChatMessage(m: ServerConversation["messages"][number]): ChatMessage {
  return {
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
    createdAt: m.createdAt,
    toolInvocations: m.toolInvocations,
    attachments: m.attachments,
  };
}

/**
 * Buffer-aware SSE reader. Yields one parsed event per complete `data:`
 * frame. Reused pattern from the MVP composer — the only piece worth
 * keeping from there.
 */
async function* readSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length === 0) continue;
        try {
          yield JSON.parse(dataLines.join("\n")) as StreamEvent;
        } catch {
          // Skip malformed events; the stream stays open.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Chat data hook. Public shape mirrors the legacy hook so the page port
 * stays close to the original. Internally:
 *
 *  - Initial load via tRPC `chat.listConversations` + `chat.getConversation`
 *    (defaults to LIMIT 50 most-recent messages, hasMore for pagination).
 *  - sendMessage POSTs to `/chat/stream` SSE endpoint, drains events,
 *    appends a user message optimistically, then a real assistant message
 *    from the `done` payload.
 *  - Streaming text + active tool indicator live in a separate `streaming`
 *    state object; the chat page renders that as an in-flight bubble
 *    alongside the settled `messages` list.
 *  - cancelStream aborts the in-flight fetch.
 *  - 429 daily_limit: error message is the server-supplied copy.
 *
 * Pitfall #11: `useMutation().execute` is unstable across renders; we
 * stash it in a ref so it doesn't churn the initial-load effect.
 * Pitfall #13: not applicable — no opts arg on this hook.
 */
export function useChat(): UseChatReturn {
  const { user } = useAuthContext();
  const { lang } = useDictionary();
  const userId = user?.id ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState<StreamingState>({
    isStreaming: false,
    streamedText: "",
    activeToolName: null,
  });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = trpc.capability.execute.useMutation();
  const executeRef = useRef(execute);
  executeRef.current = execute;

  const abortRef = useRef<AbortController | null>(null);

  // Initial load — find latest conversation, fetch its first 50 messages.
  useEffect(() => {
    if (!userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const list = (await executeRef.current.mutateAsync({
          name: "chat.listConversations",
          input: { limit: 1 },
        })) as { conversations: Array<{ id: string }> };

        if (cancelled) return;

        if (list.conversations.length === 0) {
          setMessages([]);
          setConversationId(null);
          setHasMore(false);
          return;
        }

        const latest = list.conversations[0];
        const convo = (await executeRef.current.mutateAsync({
          name: "chat.getConversation",
          input: { conversationId: latest.id, limit: PAGE_SIZE, offset: 0 },
        })) as ServerConversation;

        if (cancelled) return;

        setConversationId(latest.id);
        setMessages(convo.messages.map(toChatMessage));
        setHasMore(convo.hasMore);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load conversation");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Cancel any in-flight stream when the hook unmounts so a navigation
  // away doesn't leave the SSE call orphaned.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore) return;
    try {
      const offset = messages.length;
      const convo = (await executeRef.current.mutateAsync({
        name: "chat.getConversation",
        input: { conversationId, limit: PAGE_SIZE, offset },
      })) as ServerConversation;

      // Older messages prepend; chronological order maintained.
      setMessages((prev) => [...convo.messages.map(toChatMessage), ...prev]);
      setHasMore(convo.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more messages");
    }
  }, [conversationId, hasMore, messages.length]);

  const sendMessage = useCallback(
    async (text: string, attachments?: ComposerAttachment[]) => {
      if (!userId) return;

      setError(null);
      setSending(true);

      const tempUserId = `optimistic-user-${Date.now()}`;

      // Optimistic user message — appears instantly. Real id replaces
      // tempUserId once the server sends `user-saved`.
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserId,
          role: "user",
          content: text,
          createdAt: new Date(),
          toolInvocations: null,
          attachments: attachments ?? null,
        },
      ]);

      setStreaming({
        isStreaming: true,
        streamedText: "",
        activeToolName: null,
      });

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        // Phase B refactor: read from auth-token-store instead of calling
        // supabase.auth.getSession() per chat-message send. waitForToken's
        // bounded timeout (1500ms default) gracefully degrades if the
        // listener hasn't fired yet — though for chat, the user has
        // already loaded the chat page (so auth has long since settled)
        // and the wait is effectively a sync read.
        const token = await waitForToken();
        if (!token) throw new Error("Not signed in");

        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL not configured");

        const response = await fetch(`${apiUrl}/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            conversationId,
            message: text,
            locale: lang,
            attachments,
          }),
          signal: abort.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = `Request failed (${response.status})`;
          try {
            const errJson = JSON.parse(errText) as {
              error?: string;
              message?: string;
            };
            if (response.status === 429 && errJson.error === "daily_limit" && errJson.message) {
              errMsg = errJson.message;
            } else if (errJson.error) {
              errMsg = errJson.error;
            }
          } catch {
            errMsg = errText.slice(0, 200) || errMsg;
          }
          throw new Error(errMsg);
        }
        if (!response.body) throw new Error("Empty response body");

        for await (const event of readSseStream(response.body)) {
          switch (event.type) {
            case "user-saved":
              // Promote conversation id (first message in a brand-new
              // conversation) and replace the optimistic temp id with the
              // server-assigned uuid.
              setConversationId(event.conversationId);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempUserId ? { ...m, id: event.userMessageId } : m,
                ),
              );
              break;

            case "thinking":
              setStreaming((s) => ({ ...s, activeToolName: null }));
              break;

            case "tool-start":
              setStreaming((s) => ({ ...s, activeToolName: event.name }));
              break;

            case "tool-end":
              // Just clear the active-tool indicator; the result lands at
              // `done` time, after which the page renders rich cards.
              setStreaming((s) => ({ ...s, activeToolName: null }));
              break;

            case "text-delta":
              setStreaming((s) => ({
                ...s,
                streamedText: s.streamedText + event.content,
                activeToolName: null,
              }));
              break;

            case "done":
              // Construct the persisted assistant message from the `done`
              // payload directly — no refetch needed, in-page state is
              // authoritative for the active turn.
              setMessages((prev) => [
                ...prev,
                {
                  id: event.assistantMessageId,
                  role: "assistant",
                  content: event.assistantContent,
                  createdAt: new Date().toISOString(),
                  toolInvocations: event.toolInvocations,
                  attachments: null,
                },
              ]);
              setStreaming({
                isStreaming: false,
                streamedText: "",
                activeToolName: null,
              });
              break;

            case "error":
              throw new Error(event.message);
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") {
          // User canceled — drop the optimistic user message; clear streaming.
          setMessages((prev) => prev.filter((m) => m.id !== tempUserId));
          setStreaming({
            isStreaming: false,
            streamedText: "",
            activeToolName: null,
          });
        } else {
          setError(e.message || "Failed to send");
          setMessages((prev) => prev.filter((m) => m.id !== tempUserId));
          setStreaming({
            isStreaming: false,
            streamedText: "",
            activeToolName: null,
          });
        }
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [userId, conversationId, lang],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    loading,
    sending,
    streaming,
    hasMore,
    error,
    sendMessage,
    loadMore,
    cancelStream,
    clearError,
  };
}
