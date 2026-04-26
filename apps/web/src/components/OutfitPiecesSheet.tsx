"use client";

import { useState } from "react";
import Image from "next/image";
import type { Outfit } from "@/lib/types";
import { useDictionary } from "@/components/DictionaryProvider";
import ColorSwatch from "@/components/ColorSwatch";

interface OutfitPiecesSheetProps {
  outfit: Outfit;
  saved?: boolean;
  onSave?: () => void;
  onDelete?: () => void;
}

/**
 * Pieces detail panel inside the outfits page's BottomSheet.
 *
 * Iteration restructure note: legacy zipped two parallel arrays
 * (`outfit.itemImages[i]` + `outfit.items[i]` closetItemId string) by
 * index, then looked up `itemCategories[itemId]` and `itemColors[itemId]`
 * via parent-prop lookup maps. Our `outfit.items` is one rich array with
 * imageUrl + category + colors all on each entry, so the JSX iterates
 * once with `outfit.items.map((item) => ...)`. Same rendered output,
 * cleaner data path, no parent prop maps needed.
 */
export default function OutfitPiecesSheet({
  outfit,
  saved,
  onSave,
  onDelete,
}: OutfitPiecesSheetProps) {
  const { dict } = useDictionary();
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="pb-8 relative">
      {/* Dismiss overlay — catches taps outside delete confirmation */}
      {confirming && (
        <div
          className="absolute inset-0 z-10"
          onClick={() => setConfirming(false)}
        />
      )}

      {/* Item grid — full width, no padding */}
      <div className="grid grid-cols-2">
        {outfit.items.map((item) => (
          <div
            key={item.closetItemId}
            className="relative aspect-square bg-neutral-50 border-b border-r border-neutral-200 dark:border-neutral-700"
          >
            {item.imageUrl && (
              <Image
                src={item.imageUrl}
                alt={item.category}
                fill
                sizes="50vw"
                className="object-contain"
              />
            )}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <div className="flex items-center h-5 px-2 bg-white/80 backdrop-blur-sm">
                <span className="text-[10px] font-medium text-neutral-900 capitalize leading-none">
                  {dict.constants.categories[item.category as keyof typeof dict.constants.categories] ?? item.category}
                </span>
              </div>
              <div className="flex items-center gap-1 h-5 px-1.5 bg-white/80 backdrop-blur-sm">
                <ColorSwatch colorName={item.primaryColor} size="sm" showLabel={false} />
                {item.secondaryColor && (
                  <ColorSwatch colorName={item.secondaryColor} size="sm" showLabel={false} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Details section — matches ItemDetailContent layout */}
      <div className="px-5 pt-5 space-y-4">
        <div>
          {/* PIECES label + action icons — matches category row in ItemDetailContent */}
          <div className={`flex items-center justify-between mb-2${confirming ? " relative z-20" : ""}`}>
            <h3 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
              {dict.outfits.pieces}
            </h3>
            <div className="flex items-center gap-2">
              {confirming ? (
                <>
                  <button
                    onClick={() => { setConfirming(false); onDelete?.(); }}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400"
                  >
                    {dict.common.delete}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400"
                  >
                    {dict.common.cancel}
                  </button>
                </>
              ) : (
                <>
                  {onDelete && (
                    <button
                      onClick={() => setConfirming(true)}
                      className="p-1"
                      aria-label={dict.outfits.deleteOutfit}
                    >
                      <svg className="w-5 h-5 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  )}
                  {onSave && (
                    <button
                      onClick={onSave}
                      className="p-1"
                      aria-label={saved ? dict.outfits.savedToLookbook : dict.outfits.saveToLookbook}
                    >
                      <svg className="w-5 h-5 text-neutral-400 dark:text-neutral-500" fill={saved ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Outfit name */}
          {(outfit.name || outfit.occasion) && (
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-widest">
              {outfit.name || (dict.constants.occasionOptions[outfit.occasion as keyof typeof dict.constants.occasionOptions] ?? outfit.occasion)}
            </h4>
          )}
        </div>

        {/* Reasoning */}
        {outfit.rationale && (
          <div>
            <p className={`text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed${expanded ? "" : " line-clamp-2"}`}>
              {outfit.rationale}
            </p>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-neutral-300 dark:text-neutral-600 mt-1"
            >
              {expanded ? "less" : "more"}
            </button>
          </div>
        )}

        {/* Season tag */}
        {/* One season tag (legacy rendered multi). Our model has single
            season per context, populated at generate time. If multi-season
            UX is needed later, add outfits.seasons text[] and backfill. */}
        {outfit.season && (
          <div className="flex gap-2">
            <span className="text-xs text-neutral-400 dark:text-neutral-500 capitalize">
              {dict.constants.seasonOptions[outfit.season as keyof typeof dict.constants.seasonOptions] ?? outfit.season}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
