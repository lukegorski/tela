"use client";

import { useState } from "react";
import Image from "next/image";
import type { Outfit } from "@/lib/types";
import { useDictionary } from "@/components/DictionaryProvider";

interface OutfitCardProps {
  outfit: Outfit;
  onUpdate?: (updated: Outfit) => void;
  onDelete?: () => void;
  onToggleSave?: () => void;
  onSetFeedback?: (feedback: "up" | "down" | null) => void;
  showDetail?: boolean;
}

/**
 * Standalone outfit card — used by /outfits/[id] (deep-linked detail).
 * The legacy version embedded its own Firebase save/feedback writes; the
 * new app delegates those to callbacks (typically wired through useOutfits
 * by the page-level component).
 */
export default function OutfitCard({
  outfit,
  onDelete,
  onToggleSave,
  onSetFeedback,
  showDetail = false,
}: OutfitCardProps) {
  const { dict } = useDictionary();
  const [confirming, setConfirming] = useState(false);

  function setFeedback(feedback: "up" | "down") {
    const next = outfit.feedback === feedback ? null : feedback;
    onSetFeedback?.(next);
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      {/* Dismiss overlay — catches taps outside delete confirmation */}
      {confirming && (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false); }}
        />
      )}
      {/* Item images */}
      <div className={`grid gap-0.5 ${
        outfit.items.length <= 2
          ? "grid-cols-2"
          : outfit.items.length <= 4
          ? "grid-cols-2"
          : "grid-cols-3"
      }`}>
        {outfit.items.map((item, i) => (
          <div
            key={item.closetItemId}
            className={`aspect-square relative ${
              showDetail ? "" : "max-h-48"
            }`}
          >
            {item.imageUrl && (
              <Image
                src={item.imageUrl}
                alt={`Outfit item ${i + 1}`}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover"
              />
            )}
          </div>
        ))}
      </div>

      {/* Details */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="px-2.5 py-1 bg-stone-100 dark:bg-neutral-800 text-stone-600 dark:text-stone-400 text-xs rounded-none capitalize">
            {dict.constants.occasionOptions[outfit.occasion as keyof typeof dict.constants.occasionOptions] ?? outfit.occasion}
          </span>
          <div className={`flex items-center gap-1${confirming ? " relative z-20" : ""}`}>
            {confirming ? (
              <>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(); }}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400"
                >
                  {dict.common.delete}
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false); }}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400"
                >
                  {dict.common.cancel}
                </button>
              </>
            ) : (
              <>
                {/* Feedback buttons */}
                {onSetFeedback && (
                  <>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFeedback("up"); }}
                      className={`p-2 rounded-lg transition-colors ${
                        outfit.feedback === "up"
                          ? "bg-green-100 text-green-700"
                          : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      }`}
                      title={dict.outfits.goodOutfit}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFeedback("down"); }}
                      className={`p-2 rounded-lg transition-colors ${
                        outfit.feedback === "down"
                          ? "bg-red-100 text-red-700"
                          : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      }`}
                      title={dict.outfits.notMyStyle}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                      </svg>
                    </button>
                  </>
                )}
                {/* Save button */}
                {onToggleSave && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(); }}
                    className={`p-2 rounded-lg transition-colors ${
                      outfit.saved
                        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                    title={outfit.saved ? dict.outfits.savedToLookbook : dict.outfits.saveToLookbook}
                  >
                    <svg className="w-5 h-5" fill={outfit.saved ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                )}
                {/* Delete button */}
                {onDelete && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true); }}
                    className="p-2 rounded-lg transition-colors text-neutral-400 dark:text-neutral-500 hover:text-red-600 hover:bg-red-50"
                    title={dict.outfits.deleteOutfit}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {outfit.rationale}
        </p>
        {/* See OutfitPiecesSheet for season-tag rationale (single tag, not multi). */}
        {outfit.season && (
          <div className="flex gap-1.5 mt-3">
            <span className="text-xs text-neutral-400 dark:text-neutral-500 capitalize">
              {dict.constants.seasonOptions[outfit.season as keyof typeof dict.constants.seasonOptions] ?? outfit.season}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
