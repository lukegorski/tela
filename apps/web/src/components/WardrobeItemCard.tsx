"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { WardrobeItem } from "@/lib/types";
import { itemBgStyle } from "@/lib/styles";
import { useDictionary } from "@/components/DictionaryProvider";
import ColorSwatch from "@/components/ColorSwatch";
import LoadingSpinner from "@/components/LoadingSpinner";

export interface ImageDimensions {
  width: number;
  height: number;
}

interface WardrobeItemCardProps {
  item: WardrobeItem;
  onTap?: (item: WardrobeItem, dimensions: ImageDimensions | null) => void;
  onRetryEnhance?: () => void;
  retrying?: boolean;
  onDelete?: () => void;
  hideMetadata?: boolean;
  sizes?: string;
}

const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const ENHANCING_STATUSES = new Set(["pending", "processing"]);

export default function WardrobeItemCard({
  item,
  onTap,
  onRetryEnhance,
  retrying,
  onDelete,
  hideMetadata,
  sizes,
}: WardrobeItemCardProps) {
  const { dict, lang, translating } = useDictionary();
  const [dims, setDims] = useState<ImageDimensions | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const tr = item.translations?.[lang];
  const showSkeleton = translating && !tr && lang !== "en";

  // Auto-dismiss delete confirmation after 3 seconds (same as OutfitGridCell)
  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  // Stale check: treat "enhancing" > 5 min as failed
  const startedAtMs = item.enhancementStartedAt
    ? new Date(item.enhancementStartedAt).getTime()
    : null;
  const isStale =
    item.enhancementStatus !== null &&
    ENHANCING_STATUSES.has(item.enhancementStatus) &&
    startedAtMs !== null &&
    Date.now() - startedAtMs > STALE_THRESHOLD;
  const isEnhancing =
    item.enhancementStatus !== null &&
    ENHANCING_STATUSES.has(item.enhancementStatus) &&
    !isStale;
  const isFailed = (item.enhancementStatus === "failed" || !!isStale) && !retrying;
  const showOverlay = isEnhancing || isFailed || !!retrying;

  function handleTap() {
    onTap?.(item, dims);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmingDelete) {
      onDelete?.();
      setConfirmingDelete(false);
    } else {
      setConfirmingDelete(true);
    }
  }

  return (
    <div
      className={`group relative ${showOverlay ? "cursor-default" : "cursor-pointer"}`}
      onClick={showOverlay ? undefined : handleTap}
    >
      <div
        className="aspect-[3/4] relative overflow-hidden"
        style={itemBgStyle(item)}
      >
        {item.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={item.description ?? ""}
            fill
            sizes={sizes || "(max-width: 768px) 50vw, 33vw"}
            className="object-contain"
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              if (img.naturalWidth > 0) {
                setDims({ width: img.naturalWidth, height: img.naturalHeight });
              }
            }}
          />
        )}

        {/* White fade overlay — enhancing or failed */}
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50">
            {(isEnhancing || retrying) && <LoadingSpinner />}
            {isFailed && !retrying && onRetryEnhance && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onRetryEnhance();
                }}
                className="px-4 py-2 bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 rounded-none text-xs font-medium tracking-wide uppercase cursor-pointer hover:bg-stone-600 dark:hover:bg-stone-400 transition-colors"
              >
                {dict.wardrobe.retryEnhancement}
              </span>
            )}
          </div>
        )}

        {/* Dismiss overlay for delete confirmation */}
        {confirmingDelete && (
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmingDelete(false);
            }}
          />
        )}

        {/* X button — delete confirmation, only on failed state */}
        {isFailed && onDelete && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
            {confirmingDelete ? (
              <div className="flex items-center h-6">
                <span
                  onClick={handleDelete}
                  className="px-2 text-[10px] font-medium text-red-500 cursor-pointer"
                >
                  {dict.common.delete}
                </span>
              </div>
            ) : (
              <span
                onClick={handleDelete}
                className="flex items-center justify-center w-6 h-6 cursor-pointer"
              >
                <svg
                  className="w-5 h-5 text-neutral-400 dark:text-neutral-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </span>
            )}
          </div>
        )}
      </div>
      {/* Metadata — name left, swatches right */}
      {!hideMetadata && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-neutral-900">
          {showSkeleton ? (
            <div className="animate-pulse bg-stone-100 dark:bg-neutral-800 rounded h-4 w-20" />
          ) : (
            <span className="text-sm text-neutral-500 dark:text-neutral-400 capitalize truncate">
              {tr?.subcategory || item.subcategory}
            </span>
          )}
          <div
            className="flex items-center gap-1 shrink-0"
            title={
              (tr?.primaryColor || item.primaryColor) +
              (item.secondaryColor
                ? ` / ${tr?.secondaryColor || item.secondaryColor}`
                : "")
            }
          >
            <ColorSwatch
              colorName={item.primaryColor}
              size="sm"
              showLabel={false}
            />
            {item.secondaryColor && (
              <ColorSwatch
                colorName={item.secondaryColor}
                size="sm"
                showLabel={false}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
