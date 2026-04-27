"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Lightweight inline shape for the chat-page message renderer. The chat
 * page builds these from `useChat`'s state and from the `done` SSE event.
 * Server resolves `attachments` photoIds → signed URLs / itemIds →
 * descriptions during `streamChatTurn`; the URLs surfaced here are for
 * thumbnail rendering only.
 */
export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** ISO timestamp from the server, or a Date for optimistic messages. */
  createdAt: string | Date;
  attachmentThumbnails?: Array<{ url: string; alt?: string }>;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

function relativeTime(createdAt: string | Date): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Very lightweight inline markdown: **bold**, *italic*, and newlines.
 * Returns an array of React nodes.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");

  return lines.flatMap((line, lineIdx) => {
    const nodes: React.ReactNode[] = [];

    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

    parts.forEach((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        nodes.push(
          <strong key={`${lineIdx}-${i}`} className="font-semibold">
            {part.slice(2, -2)}
          </strong>,
        );
      } else if (part.startsWith("*") && part.endsWith("*")) {
        nodes.push(<em key={`${lineIdx}-${i}`}>{part.slice(1, -1)}</em>);
      } else {
        nodes.push(part);
      }
    });

    if (lineIdx < lines.length - 1) {
      nodes.push(<br key={`br-${lineIdx}`} />);
    }

    return nodes;
  });
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [showTime, setShowTime] = useState(false);
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
      onClick={() => setShowTime((prev) => !prev)}
    >
      <div className={`max-w-[80%] flex flex-col gap-1.5`}>
        {/* Attachment thumbnails (server-resolved URLs from the chat page) */}
        {message.attachmentThumbnails && message.attachmentThumbnails.length > 0 && (
          <div
            className={`flex gap-1.5 flex-wrap ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            {message.attachmentThumbnails.map((attachment, idx) => (
              <div
                key={idx}
                className="relative h-16 w-16 overflow-hidden rounded-xl"
              >
                <Image
                  src={attachment.url}
                  alt={attachment.alt ?? "Attachment"}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
            ))}
          </div>
        )}

        {/* Message bubble */}
        {message.content && (
          <div
            className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                : "bg-stone-100 text-stone-800 dark:bg-neutral-800 dark:text-neutral-200"
            }`}
          >
            {renderMarkdown(message.content)}
          </div>
        )}

        {/* Time stamp (visible on hover / tap) */}
        {showTime && (
          <p
            className={`text-[11px] text-neutral-400 dark:text-neutral-500 ${
              isUser ? "text-right" : "text-left"
            }`}
          >
            {relativeTime(message.createdAt)}
          </p>
        )}
      </div>
    </div>
  );
}
