"use client";

import Image from "next/image";
import type { WardrobeItem } from "@/lib/types";

interface ChatItemGridProps {
  items: WardrobeItem[];
  onTap?: (itemId: string) => void;
}

const ENHANCING_STATUSES = new Set(["pending", "processing"]);

export default function ChatItemGrid({ items, onTap }: ChatItemGridProps) {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .chat-item-shimmer {
          animation: shimmer 1.5s ease-in-out infinite;
        }
      `}</style>

      <div className="grid grid-cols-2 border-t border-l border-neutral-200 dark:border-neutral-700">
        {items.map((item) => {
          const isEnhancing =
            item.enhancementStatus !== null &&
            ENHANCING_STATUSES.has(item.enhancementStatus);
          return (
            <div
              key={item.id}
              className={`bg-white overflow-hidden border-r border-b border-neutral-200 dark:border-neutral-700${
                onTap ? " cursor-pointer" : ""
              }`}
              onClick={onTap ? () => onTap(item.id) : undefined}
            >
              {/* Item image */}
              <div className="aspect-[3/4] relative overflow-hidden bg-neutral-50">
                {item.imageUrl && (
                  <Image
                    src={item.imageUrl}
                    alt={`${item.subcategory ?? item.category} - ${item.primaryColor}`}
                    fill
                    // 2-col grid inside the chat message column
                    // (max-w-[80%] of the thread at any viewport) → ~40vw.
                    sizes="40vw"
                    className="object-contain"
                  />
                )}

                {/* Shimmer overlay while photo is being enhanced */}
                {isEnhancing && (
                  <div className="absolute inset-0 overflow-hidden z-10">
                    <div
                      className="chat-item-shimmer absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Category and color label */}
              <div className="px-2 py-1.5">
                <p className="text-xs text-neutral-700 dark:text-neutral-300 capitalize truncate">
                  {item.subcategory ?? item.category}
                </p>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 capitalize truncate">
                  {item.primaryColor}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
