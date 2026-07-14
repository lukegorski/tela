"use client";

import { useState, useEffect, memo } from "react";
import Image from "next/image";
import type { Outfit } from "@/lib/types";
import { useDictionary } from "@/components/DictionaryProvider";
import LoadingSpinner from "@/components/LoadingSpinner";

interface OutfitGridCellProps {
  outfit: Outfit;
  onTap?: () => void;
  onRequestTryOn?: () => void;
  onDelete?: () => void;
  hideOccasion?: boolean;
  /** Set on the first (above-the-fold) cell so its try-on image — the
   *  page's likely LCP — gets a preload link instead of lazy loading. */
  preload?: boolean;
}

function OutfitGridCell({ outfit, onTap, onRequestTryOn, onDelete, hideOccasion, preload }: OutfitGridCellProps) {
  const { dict } = useDictionary();
  const tryOnStatus = outfit.tryOn?.status ?? null;
  const isLoading = tryOnStatus === "pending" || tryOnStatus === "running";
  const [tryOnBroken, setTryOnBroken] = useState(false);
  const tryOnImageURL = outfit.tryOn?.resultUrl ?? null;
  const hasTryOnImage = tryOnStatus === "complete" && tryOnImageURL && !tryOnBroken;
  const isFailed = tryOnStatus === "failed";
  const needsTryOn = tryOnStatus === null || isFailed;

  // Delete confirmation state
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmingDelete) {
      onDelete?.();
      setConfirmingDelete(false);
    } else {
      setConfirmingDelete(true);
    }
  }

  function handleTryOn(e: React.MouseEvent) {
    e.stopPropagation();
    onRequestTryOn?.();
  }

  return (
    <button
      onClick={onTap}
      className="relative w-full h-full overflow-hidden bg-white block text-left"
    >
      {hasTryOnImage ? (
        <Image
          src={tryOnImageURL!}
          alt={outfit.occasion ? `${outfit.occasion} outfit` : 'outfit'}
          fill
          // Mobile grid (below Tailwind sm, 640px) is 2 or 3 columns →
          // up to 50vw per cell; desktop grid is 5 columns → 20vw.
          sizes="(max-width: 640px) 50vw, 20vw"
          className="object-cover"
          preload={preload}
          onError={() => setTryOnBroken(true)}
        />
      ) : (
        /* Item image grid — shown for loading, failed, and no-try-on states */
        <>
          <div className="w-full h-full grid grid-cols-2">
            {outfit.items.slice(0, 4).map((item, i) => (
              <div key={item.closetItemId} className="relative overflow-hidden bg-white">
                {item.imageUrl && (
                  <Image
                    src={item.imageUrl}
                    alt={`Item ${i + 1}`}
                    fill
                    // Quarter of a grid cell: ≤25vw mobile, 10vw desktop.
                    sizes="(max-width: 640px) 25vw, 10vw"
                    className="object-contain"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Loading overlay: faded grid + pulsing Tela logo */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50">
              <LoadingSpinner />
            </div>
          )}

          {/* "Try on" / "Retry" button */}
          {needsTryOn && onRequestTryOn && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <span
                onClick={handleTryOn}
                className="px-4 py-2 bg-stone-700 text-stone-50 rounded-none text-xs font-medium tracking-wide uppercase cursor-pointer hover:bg-stone-600 transition-colors"
              >
                {isFailed ? dict.outfits.retryTryOn : dict.outfits.tryOn}
              </span>
            </div>
          )}
        </>
      )}

      {/* Dismiss overlay — catches taps outside delete confirmation */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
        />
      )}

      {/* Action button — top-right (hidden only on completed try-on images) */}
      {onDelete && !hasTryOnImage && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          {confirmingDelete ? (
            <div className="flex items-center h-6">
              <span
                onClick={handleDelete}
                className="px-2 text-[10px] font-medium text-red-500 cursor-pointer"
              >
                {dict.common.delete}
              </span>
              {(isLoading || isFailed) && onRequestTryOn && (
                <span
                  onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); onRequestTryOn(); }}
                  className="px-2 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer"
                >
                  {dict.outfits.retryTryOn}
                </span>
              )}
            </div>
          ) : (
            <span
              onClick={handleDelete}
              className="flex items-center justify-center w-6 h-6 cursor-pointer"
            >
              <svg className="w-5 h-5 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
        </div>
      )}

      {/* Occasion category (absent on manually-built outfits) */}
      {!hideOccasion && outfit.occasion && (
        <span className="absolute bottom-2 left-2.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
          {dict.constants.occasionOptions[outfit.occasion as keyof typeof dict.constants.occasionOptions] ?? outfit.occasion}
        </span>
      )}

      {/* Saved indicator — top-left */}
      {outfit.saved && (
        <div className="absolute top-2 left-2">
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
    </button>
  );
}

export default memo(OutfitGridCell, (prev, next) =>
  prev.outfit.id === next.outfit.id &&
  (prev.outfit.tryOn?.status ?? null) === (next.outfit.tryOn?.status ?? null) &&
  (prev.outfit.tryOn?.resultUrl ?? null) === (next.outfit.tryOn?.resultUrl ?? null) &&
  prev.outfit.saved === next.outfit.saved &&
  prev.hideOccasion === next.hideOccasion
);
