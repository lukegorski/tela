"use client";

import Image from "next/image";
import { useDictionary } from "@/components/DictionaryProvider";
import type { Outfit } from "@/lib/types";

interface ChatOutfitGridProps {
  outfits: Outfit[];
  /**
   * Optimistic-save IDs maintained by the parent chat page. Layered over
   * each outfit's persisted `saved` flag so a tap-to-save flips the CTA
   * from "Add Outfit" to "View" instantly without waiting for the next
   * fetch.
   */
  optimisticSavedIds?: Set<string>;
  onSave: (outfitId: string) => void;
  onView: (outfitId: string) => void;
  onTap?: (outfitId: string) => void;
}

export default function ChatOutfitGrid({
  outfits,
  optimisticSavedIds,
  onSave,
  onView,
  onTap,
}: ChatOutfitGridProps) {
  const { dict } = useDictionary();

  return (
    <div className="grid grid-cols-2 border-t border-l border-neutral-200 dark:border-neutral-700">
      {outfits.map((outfit) => {
        const itemImages = outfit.items
          .map((it) => it.imageUrl)
          .filter((u): u is string => u !== null);
        const saved = outfit.saved || (optimisticSavedIds?.has(outfit.id) ?? false);

        return (
          <div
            key={outfit.id}
            className="bg-white overflow-hidden border-r border-b border-neutral-200 dark:border-neutral-700"
          >
            {/* Item image collage — always 4 slots, matches OutfitGridCell */}
            <div
              className={`relative aspect-square grid grid-cols-2 gap-0.5${
                onTap ? " cursor-pointer" : ""
              }`}
              onClick={onTap ? () => onTap(outfit.id) : undefined}
            >
              {Array.from({ length: 4 }).map((_, i) => {
                const url = itemImages[i];
                return (
                  <div key={i} className="relative overflow-hidden bg-white">
                    {url && (
                      <Image
                        src={url}
                        alt={`Item ${i + 1}`}
                        fill
                        sizes="(max-width: 768px) 20vw, 16vw"
                        className="object-contain"
                      />
                    )}
                  </div>
                );
              })}

              {/* Add Outfit / View button — centered overlay */}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (saved) {
                      onView(outfit.id);
                    } else {
                      onSave(outfit.id);
                    }
                  }}
                  className="px-4 py-2 bg-stone-700 text-stone-50 rounded-none text-xs font-medium tracking-wide uppercase cursor-pointer hover:bg-stone-600 transition-colors"
                >
                  {saved
                    ? dict.outfits?.viewOutfit || "View"
                    : dict.outfits?.addOutfit || "Add Outfit"}
                </span>
              </div>

              {/* Saved indicator — top-left, matches OutfitGridCell */}
              {saved && (
                <div className="absolute top-2 left-2 z-10">
                  <svg
                    className="w-4 h-4 text-neutral-900 dark:text-neutral-100"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Outfit name */}
            {outfit.name && (
              <div className="px-2 py-1.5">
                <span className="text-xs text-neutral-700 dark:text-neutral-300 capitalize truncate">
                  {outfit.name}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
