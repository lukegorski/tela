'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface Props {
  conversationId: string | null;
  initialMessages: Message[];
  lang: string;
}

export function ChatComposer({ conversationId, initialMessages, lang }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [activeConvoId, setActiveConvoId] = useState<string | null>(conversationId);
  const sendMessage = trpc.capability.execute.useMutation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sendMessage.isPending) return;

    const text = draft.trim();
    setDraft('');

    // Optimistic user message
    const tempUserId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: text, createdAt: new Date().toISOString() },
    ]);

    try {
      const result = (await sendMessage.mutateAsync({
        name: 'chat.sendMessage',
        input: {
          conversationId: activeConvoId,
          message: text,
          locale: lang,
        },
      })) as {
        conversationId: string;
        userMessageId: string;
        assistantMessageId: string;
        assistantContent: string;
      };

      setActiveConvoId(result.conversationId);

      // Replace temp message with real one + append assistant reply
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserId),
        {
          id: result.userMessageId,
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        },
        {
          id: result.assistantMessageId,
          role: 'assistant',
          content: result.assistantContent,
          createdAt: new Date().toISOString(),
        },
      ]);

      // If this was a new conversation, refresh so the URL updates
      if (!conversationId) {
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${msg}`,
          createdAt: new Date().toISOString(),
        },
      ]);
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
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))
        )}
        {sendMessage.isPending && (
          <MessageBubble role="assistant" content="…" />
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
          disabled={!draft.trim() || sendMessage.isPending}
          className="px-4 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 disabled:opacity-50 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
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

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser ? 'bg-stone-700 text-stone-50' : 'bg-stone-100 text-stone-900'
        }`}
      >
        {content}
      </div>
    </div>
  );
}
