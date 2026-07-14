"use client";

import { useState, useEffect, memo } from "react";
import Image from "next/image";
import type { Outfit } from "@/lib/types";
import { useDictionary } from "@/components/DictionaryProvider";
import LoadingSpinner from "@/components/LoadingSpinner";

interface OutfitHeroProps {
  outfit: Outfit;
  onTap: () => void;
  onToggleSave?: () => void;
  onRequestTryOn?: () => void;
  onDelete?: () => void;
}

function OutfitHero({ outfit, onTap, onToggleSave, onRequestTryOn, onDelete }: OutfitHeroProps) {
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

  // Auto-dismiss delete confirmation after 3 seconds
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
    <section className="h-full snap-start relative flex-shrink-0">
      {/* Image / Loading / Fallback */}
      {hasTryOnImage ? (
        /* Try-on hero image */
        <button
          onClick={onTap}
          className="relative w-full h-full block"
        >
          <Image
            src={tryOnImageURL!}
            alt={outfit.occasion ? `${outfit.occasion} outfit` : 'outfit'}
            fill
            sizes="100vw"
            className="object-cover"
            preload
            onError={() => setTryOnBroken(true)}
          />
        </button>
      ) : (
        /* Item image grid — shown for loading, failed, and no-try-on states */
        <button
          onClick={onTap}
          className="w-full h-full block"
        >
          <div
            className={`w-full h-full grid grid-cols-2`}
          >
            {outfit.items.map((item, i) => (
              <div key={item.closetItemId} className="relative overflow-hidden bg-white">
                {item.imageUrl && (
                  <Image
                    src={item.imageUrl}
                    alt={`Item ${i + 1}`}
                    fill
                    sizes="50vw"
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

          {/* "Try on" / "Retry" button — centered over the item grid */}
          {needsTryOn && onRequestTryOn && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <span
                onClick={handleTryOn}
                className="px-6 py-2.5 bg-stone-700 text-stone-50 rounded-none text-sm font-medium tracking-wide uppercase cursor-pointer hover:bg-stone-600 transition-colors"
              >
                {isFailed ? dict.outfits.retryTryOn : dict.outfits.tryOn}
              </span>
            </div>
          )}
        </button>
      )}

      {/* No gradient overlays — icons and text use their own backgrounds for readability */}

      {/* Dismiss overlay — catches taps outside delete confirmation */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
        />
      )}

      {/* Action button — top-right (hidden only on completed try-on images) */}
      {onDelete && !hasTryOnImage && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {confirmingDelete ? (
            <div className="flex items-center h-7">
              <button
                onClick={handleDelete}
                className="px-2.5 text-xs font-medium text-red-500"
              >
                {dict.common.delete}
              </button>
              {/* Show Retry option when try-on is loading/failed */}
              {(isLoading || isFailed) && onRequestTryOn && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); onRequestTryOn(); }}
                  className="px-2.5 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                >
                  {dict.outfits.retryTryOn}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="flex items-center justify-center w-7 h-7"
            >
              <svg className="w-5 h-5 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Occasion category (absent on manually-built outfits) */}
      {outfit.occasion && (
        <div className="absolute bottom-6 left-5">
          <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            {dict.constants.occasionOptions[outfit.occasion as keyof typeof dict.constants.occasionOptions] ?? outfit.occasion}
          </span>
        </div>
      )}

      {/* Save to lookbook button */}
      {onToggleSave && (
        <div className="absolute bottom-6 right-5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            className={`flex items-center justify-center w-7 h-7 transition-colors ${
              outfit.saved
                ? "text-neutral-900 dark:text-neutral-100"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill={outfit.saved ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}

export default memo(OutfitHero, (prev, next) =>
  prev.outfit.id === next.outfit.id &&
  (prev.outfit.tryOn?.status ?? null) === (next.outfit.tryOn?.status ?? null) &&
  (prev.outfit.tryOn?.resultUrl ?? null) === (next.outfit.tryOn?.resultUrl ?? null) &&
  prev.outfit.saved === next.outfit.saved
);
