"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { WardrobeItem } from "@/lib/types";
import type { ImageDimensions } from "@/components/WardrobeItemCard";
import ColorSwatch from "@/components/ColorSwatch";
import { useDictionary } from "@/components/DictionaryProvider";
import { itemBgStyle } from "@/lib/styles";

/** Bottom sheet content for a wardrobe item — uses pre-measured dimensions from grid */
export function ItemDetailContent({
  item,
  dimensions,
  onImageTap,
  onDelete,
}: {
  item: WardrobeItem;
  dimensions: ImageDimensions | null;
  onImageTap?: (url: string) => void;
  onDelete?: () => void;
}) {
  const { dict, lang } = useDictionary();
  const [confirming, setConfirming] = useState(false);
  const [measuredDims, setMeasuredDims] = useState<ImageDimensions | null>(null);

  // Reset self-measured dimensions when item changes
  useEffect(() => { setMeasuredDims(null); }, [item.id]);

  const effectiveDims = dimensions || measuredDims;
  const containerStyle: React.CSSProperties = {};
  if (effectiveDims && effectiveDims.width > 0) {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 430;
    const aspectRatio = effectiveDims.height / effectiveDims.width;
    const renderedHeight = viewportWidth * aspectRatio;
    const maxH = typeof window !== "undefined" ? window.innerHeight * 0.5 : 400;
    containerStyle.height = Math.min(renderedHeight, maxH);
  }

  const tr = item.translations?.[lang];
  const canTapImage = onImageTap && item.imageUrl;

  return (
    <div className="pb-8 relative">
      {/* Dismiss overlay — catches taps outside delete confirmation */}
      {confirming && (
        <div
          className="absolute inset-0 z-10"
          onClick={() => setConfirming(false)}
        />
      )}
      {/* Image container — pre-sized from grid dimensions, zero layout shift */}
      <div
        className={`w-full relative${canTapImage ? " cursor-pointer" : ""}${!effectiveDims ? " aspect-[3/4] max-h-[50dvh]" : ""}`}
        style={{ ...containerStyle, ...itemBgStyle(item) }}
        onClick={canTapImage ? () => onImageTap!(item.imageUrl!) : undefined}
      >
        {item.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={item.description ?? ""}
            fill
            // BottomSheet is full-width on mobile but a 420px side panel
            // from Tailwind sm (640px) up — claiming 100vw there trips
            // Next's "not rendered at full viewport width" warning and
            // over-fetches ~4x.
            sizes="(max-width: 640px) 100vw, 420px"
            className="object-contain"
            onLoad={!dimensions ? (e) => {
              const img = e.target as HTMLImageElement;
              if (img.naturalWidth > 0) {
                setMeasuredDims({ width: img.naturalWidth, height: img.naturalHeight });
              }
            } : undefined}
          />
        )}
      </div>

      {/* Item details */}
      <div className="px-5 pt-5 space-y-4">
        <div>
          {/* Category label + delete icon — matches OutfitPiecesSheet header */}
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
              {dict.constants.categories[item.category as keyof typeof dict.constants.categories] ?? item.category}
            </h4>
            {onDelete && (
              <div className={`flex items-center${confirming ? " relative z-20" : ""}`}>
                {confirming ? (
                  <>
                    <span className="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                      {dict.wardrobe.deleteItemWarning}
                    </span>
                    <button
                      onClick={() => { setConfirming(false); onDelete(); }}
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
                  <button
                    onClick={() => setConfirming(true)}
                    className="p-1"
                    aria-label={dict.wardrobe.deleteItem}
                  >
                    <svg className="w-5 h-5 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Item name */}
          <h3 className="text-sm font-semibold tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
            {tr?.subcategory || item.subcategory}
          </h3>
          <div className="flex items-center gap-3 text-sm text-neutral-400 dark:text-neutral-500 mt-1">
            <ColorSwatch colorName={item.primaryColor} displayName={tr?.primaryColor} size="md" />
            {item.secondaryColor && (
              <ColorSwatch colorName={item.secondaryColor} displayName={tr?.secondaryColor} size="md" />
            )}
          </div>
        </div>

        <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
          {tr?.description || item.description}
        </p>

        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 capitalize">
            {dict.constants.categories[item.category as keyof typeof dict.constants.categories] ?? item.category}
          </span>
          {item.style && (
            <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 capitalize">
              {dict.constants.itemStyles[item.style as keyof typeof dict.constants.itemStyles] ?? item.style}
            </span>
          )}
          {item.material && (
            <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 capitalize">
              {item.material}
            </span>
          )}
          {item.pattern && item.pattern !== "solid" && (
            <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 capitalize">
              {dict.constants.patternOptions[item.pattern as keyof typeof dict.constants.patternOptions] ?? item.pattern}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {item.seasonCompatibility.map((s) => (
            <span
              key={s}
              className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-400 dark:text-neutral-500 capitalize"
            >
              {dict.constants.seasonOptions[s as keyof typeof dict.constants.seasonOptions] ?? s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
