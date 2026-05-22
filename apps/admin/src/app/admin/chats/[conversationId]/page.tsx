import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getConversation,
  type ConversationMessage,
  type ConversationMeta,
} from '@/lib/admin-conversation';
import { formatCents } from '@/lib/admin-stats';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  await requireAdmin();

  const { conversationId } = await params;
  const detail = await getConversation(conversationId);
  if (!detail) notFound();
  const { conversation, messages } = detail;

  return (
    <div className="space-y-6 max-w-3xl">
      <Header conversation={conversation} />
      <MessageList messages={messages} />
    </div>
  );
}

function Header({ conversation }: { conversation: ConversationMeta }) {
  return (
    <header>
      <div className="flex items-center gap-3 mb-3 text-xs">
        <Link href="/admin/chat" className="text-stone-500 hover:text-stone-900">
          ← Chat overview
        </Link>
        <span className="text-stone-300">·</span>
        <Link
          href={`/admin/users/${conversation.userId}?tab=chats`}
          className="text-stone-500 hover:text-stone-900"
        >
          User&apos;s conversations
        </Link>
      </div>
      <h2 className="text-lg font-medium tracking-tight">{conversation.title ?? '(untitled)'}</h2>
      <p className="text-sm text-stone-500">
        <Link
          href={`/admin/users/${conversation.userId}`}
          className="text-stone-700 hover:text-stone-900"
        >
          {conversation.displayName ?? conversation.email ?? conversation.userId.slice(0, 8) + '…'}
        </Link>
        {' · '}
        started {new Date(conversation.createdAt).toLocaleString()}
      </p>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-stone-500 font-mono">
        <span>{conversation.messageCount} messages</span>
        <span>{formatCents(conversation.chatCostCents)} chat cost</span>
        <span>
          last active{' '}
          {conversation.lastMessageAt
            ? new Date(conversation.lastMessageAt).toLocaleString()
            : '—'}
        </span>
      </div>
    </header>
  );
}

function MessageList({ messages }: { messages: ConversationMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-xs text-stone-400 italic">No messages in this conversation.</p>;
  }
  return (
    <div className="space-y-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user';
  const align = isUser ? 'justify-end' : 'justify-start';
  const bubble = isUser
    ? 'bg-stone-800 text-white'
    : message.role === 'system'
      ? 'bg-amber-50 text-amber-900 border border-amber-200'
      : 'bg-stone-100 text-stone-800';
  return (
    <div className={`flex ${align}`}>
      <div className="max-w-[85%] flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-400">
          <span>{message.role}</span>
          {message.model && <span className="font-mono normal-case">· {message.model}</span>}
          {message.costCents != null && (
            <span className="font-mono normal-case">· {formatCents(message.costCents)}</span>
          )}
        </div>
        {message.content && (
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${bubble}`}>
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
                    ? 'border-stone-200 bg-stone-50 text-stone-600'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                <p className="font-mono">
                  {tc.ok ? '✓' : '✗'} {tc.name}
                  {tc.error && <span className="text-red-600"> — {tc.error}</span>}
                </p>
                <pre className="mt-0.5 text-stone-500 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(tc.args, null, 0)}
                </pre>
              </li>
            ))}
          </ul>
        )}
        <p className={`text-[11px] text-stone-400 font-mono ${isUser ? 'text-right' : 'text-left'}`}>
          {new Date(message.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
