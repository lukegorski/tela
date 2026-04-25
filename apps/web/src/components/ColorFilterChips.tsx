"use client";

import { useMemo } from "react";
import ColorSwatch from "@/components/ColorSwatch";
import { useDictionary } from "@/components/DictionaryProvider";
import type { WardrobeItem } from "@/lib/types";

function toTitleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ColorFilterChipsProps {
  wardrobeItems: WardrobeItem[];
  colorFilters: string[];
  setColorFilters: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function ColorFilterChips({
  wardrobeItems,
  colorFilters,
  setColorFilters,
}: ColorFilterChipsProps) {
  const { lang, dict } = useDictionary();

  // Build a map of English color -> translated display name
  const { uniqueColors, colorDisplayNames } = useMemo(() => {
    const seen = new Set<string>();
    const displayMap = new Map<string, string>();
    wardrobeItems.forEach((item) => {
      const tr = item.translations?.[lang];
      if (item.primaryColor) {
        const key = item.primaryColor.toLowerCase();
        seen.add(key);
        if (tr?.primaryColor && !displayMap.has(key)) {
          displayMap.set(key, tr.primaryColor);
        }
      }
      if (item.secondaryColor) {
        const key = item.secondaryColor.toLowerCase();
        seen.add(key);
        if (tr?.secondaryColor && !displayMap.has(key)) {
          displayMap.set(key, tr.secondaryColor);
        }
      }
    });
    return {
      uniqueColors: Array.from(seen).sort(),
      colorDisplayNames: displayMap,
    };
  }, [wardrobeItems, lang]);

  if (uniqueColors.length === 0) return null;

  return (
    <>
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3 mt-6">
        {dict.wardrobe.colors}
      </p>
      <div className="flex flex-wrap gap-2">
        {uniqueColors.map((color) => (
          <button
            key={color}
            onClick={() =>
              setColorFilters((prev) =>
                prev.includes(color)
                  ? prev.filter((c) => c !== color)
                  : [...prev, color]
              )
            }
            className={`px-3 py-2 rounded-none border-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              colorFilters.includes(color)
                ? "border-stone-700 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900 dark:border-stone-300"
                : "border-stone-200 dark:border-neutral-600 text-stone-700 dark:text-stone-300"
            }`}
          >
            <ColorSwatch colorName={color} size="sm" showLabel={false} />
            {toTitleCase(colorDisplayNames.get(color) || color)}
          </button>
        ))}
      </div>
    </>
  );
}
