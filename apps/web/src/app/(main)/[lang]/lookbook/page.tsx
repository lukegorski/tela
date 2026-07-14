"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useScrollPersistence } from "@/hooks/useScrollPersistence";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import OutfitHero from "@/components/OutfitHero";
import OutfitGridCell from "@/components/OutfitGridCell";
import OutfitPiecesSheet from "@/components/OutfitPiecesSheet";
import LoadingSpinner from "@/components/LoadingSpinner";
import BottomSheet from "@/components/BottomSheet";
import ColorFilterChips from "@/components/ColorFilterChips";
import { useWardrobe } from "@/hooks/useWardrobe";
import { useOutfits } from "@/hooks/useOutfits";
import type { Outfit } from "@/lib/types";

export default function LookbookPage() {
  const { dict } = useDictionary();
  const { user } = useAuthContext();
  const {
    outfits,
    loading,
    toggleSave,
    removeOutfit,
  } = useOutfits({ savedOnly: true });
  const [showFilter, setShowFilter] = useState(false);
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null);
  const { items: wardrobeItems } = useWardrobe();
  const feedRef = useRef<HTMLDivElement>(null);
  const previousGridState = useRef<{ mode: 2 | 3; scrollTop: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  useScrollPersistence("lookbook-scroll", feedRef, !loading);

  // Grid mode: 1 = full-screen hero, 2 = two-column (default), 3 = three-column
  const [gridMode, setGridMode] = useState<1 | 2 | 3>(2);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("lookbook-grid-mode");
    if (saved === "1") setGridMode(1);
    else if (saved === "3") setGridMode(3);
  }, []);

  function cycleGridMode() {
    if (transitioning) return;
    if (previousGridState.current) {
      swipeBackToGrid();
      return;
    }
    setTransitioning(true);
    setTimeout(() => {
      setGridMode((prev) => {
        const next = prev === 1 ? 2 : prev === 2 ? 3 : 1;
        localStorage.setItem("lookbook-grid-mode", String(next));
        return next;
      });
      feedRef.current?.scrollTo({ top: 0 });
      setTransitioning(false);
    }, 150);
  }

  function switchToHeroAndSelect(outfit: Outfit) {
    if (transitioning) return;
    previousGridState.current = {
      mode: gridMode as 2 | 3,
      scrollTop: feedRef.current?.scrollTop || 0,
    };
    setTransitioning(true);
    setTimeout(() => {
      setGridMode(1);
      localStorage.setItem("lookbook-grid-mode", "1");
      setTransitioning(false);
      requestAnimationFrame(() => {
        const index = filteredOutfits.findIndex((o) => o.id === outfit.id);
        const containerHeight = feedRef.current?.clientHeight || 0;
        feedRef.current?.scrollTo({ top: index * containerHeight });
        setTimeout(() => setSelectedOutfit(outfit), 150);
      });
    }, 150);
  }

  function swipeBackToGrid() {
    if (!previousGridState.current || transitioning) return;
    const { mode, scrollTop } = previousGridState.current;
    previousGridState.current = null;
    const sheetOpen = selectedOutfit !== null;
    if (sheetOpen) setSelectedOutfit(null);
    setTransitioning(true);
    setTimeout(() => {
      setGridMode(mode);
      localStorage.setItem("lookbook-grid-mode", String(mode));
      setTransitioning(false);
      requestAnimationFrame(() => {
        feedRef.current?.scrollTo({ top: scrollTop });
      });
    }, sheetOpen ? 500 : 150);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current || !previousGridState.current || selectedOutfit) return;
    const startX = touchStartRef.current.x;
    const deltaX = e.changedTouches[0].clientX - startX;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (startX > 50 && deltaX > 80 && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
      swipeBackToGrid();
    }
  }

  // Build item color lookup for the color filter. Wardrobe is the source of
  // truth for the filter palette (ColorFilterChips below) and the legacy
  // page also filtered outfits via this lookup; we mirror that path here so
  // the filter behavior stays identical even though our rich outfit items
  // already carry colors per piece.
  const itemColorMap = useMemo(() => new Map(
    wardrobeItems.map((item) => [
      item.id,
      { primary: item.primaryColor, secondary: item.secondaryColor },
    ])
  ), [wardrobeItems]);

  const filteredOutfits = useMemo(() => outfits.filter((o) => {
    if (colorFilters.length === 0) return true;
    return o.items.some((item) => {
      const colors = itemColorMap.get(item.closetItemId);
      if (!colors) return false;
      return colorFilters.some(
        (c) =>
          colors.primary.toLowerCase() === c ||
          (colors.secondary && colors.secondary.toLowerCase() === c)
      );
    });
  }), [outfits, colorFilters, itemColorMap]);

  function handleDeleteOutfit() {
    if (!user || !selectedOutfit) return;
    const outfitToDelete = selectedOutfit;
    setSelectedOutfit(null);
    setTimeout(() => {
      removeOutfit(outfitToDelete.id).catch((err) =>
        console.error("Delete failed:", err)
      );
    }, 500);
  }

  async function handleToggleSave() {
    if (!user || !selectedOutfit) return;
    const newSaved = !selectedOutfit.saved;
    // Close the sheet first when unsaving — toggleSave will filter the row
    // out of the list immediately (savedOnly mode), so leaving the sheet
    // pinned to a now-removed outfit would flash empty content.
    if (!newSaved) setSelectedOutfit(null);
    await toggleSave(selectedOutfit.id, newSaved);
  }

  return (
    <ProtectedRoute>
      <div className="h-[calc(100dvh-4rem)] sm:h-auto flex flex-col bg-neutral-50 dark:bg-neutral-800 sm:bg-white sm:dark:bg-neutral-900">
        {/* Header */}
        <header className="flex-none flex items-center justify-between px-4 pt-4 pb-3 bg-white dark:bg-neutral-900">
          <h1 className="text-sm font-semibold tracking-widest uppercase">
            {dict.lookbook.title}
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={cycleGridMode}
              className="p-1 sm:hidden"
              aria-label="Change grid layout"
            >
              <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                />
              </svg>
            </button>
            <button
              onClick={() => setShowFilter(true)}
              className="relative p-1"
              aria-label="Filter lookbook"
            >
              <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                />
              </svg>
              {colorFilters.length > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-neutral-900 dark:bg-neutral-100 rounded-full" />
              )}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center sm:min-h-[calc(100dvh-8rem)]">
            <LoadingSpinner variant="auto" />
          </div>
        ) : filteredOutfits.length > 0 ? (
          <>
            {/* Mobile: hero or grid */}
            <div className="flex-1 relative min-h-0 sm:hidden">
              <div
                ref={feedRef}
                className={`h-full overflow-y-auto ${gridMode === 1 ? "snap-y snap-mandatory" : ""}`}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <div className={`transition-opacity duration-150 ${transitioning ? "opacity-0" : "opacity-100"} ${gridMode === 1 ? "h-full" : ""}`}>
                  {gridMode === 1 ? (
                    <>
                      {filteredOutfits.map((outfit) => (
                        <OutfitHero
                          key={outfit.id}
                          outfit={outfit}
                          onTap={() => setSelectedOutfit(outfit)}
                          onToggleSave={() => {
                            toggleSave(outfit.id, !outfit.saved).catch((err) =>
                              console.error("Toggle save failed:", err)
                            );
                          }}
                          onDelete={() => {
                            removeOutfit(outfit.id).catch((err) =>
                              console.error("Delete failed:", err)
                            );
                          }}
                        />
                      ))}
                    </>
                  ) : (
                    <div className="relative min-h-full">
                      <div className={`grid ${gridMode === 2 ? "grid-cols-2" : "grid-cols-3"} gap-px bg-neutral-200 dark:bg-neutral-700`}>
                        {filteredOutfits.map((outfit, i) => (
                          <div key={outfit.id} className="bg-white aspect-[3/4] relative">
                            <OutfitGridCell
                              outfit={outfit}
                              preload={i === 0}
                              hideOccasion={gridMode === 3}
                              onTap={() => switchToHeroAndSelect(outfit)}
                              onDelete={() => {
                                removeOutfit(outfit.id).catch((err) =>
                                  console.error("Delete failed:", err)
                                );
                              }}
                            />
                          </div>
                        ))}
                        {filteredOutfits.length % gridMode !== 0 && (
                          <div className="bg-white dark:bg-neutral-900" style={{ gridColumn: `span ${gridMode - (filteredOutfits.length % gridMode)}` }} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop: fixed grid */}
            <div className="hidden sm:block flex-1 relative">
              <div className="grid grid-cols-5 gap-px bg-neutral-200 dark:bg-neutral-700">
                {filteredOutfits.map((outfit, i) => (
                  <div key={outfit.id} className="bg-white h-[calc(100vh-10rem)]">
                    <OutfitGridCell
                      outfit={outfit}
                      preload={i === 0}
                      onTap={() => setSelectedOutfit(outfit)}
                      onDelete={() => {
                        removeOutfit(outfit.id).catch((err) =>
                          console.error("Delete failed:", err)
                        );
                      }}
                    />
                  </div>
                ))}
                {filteredOutfits.length % 5 !== 0 && (
                  <div className="bg-white dark:bg-neutral-900" style={{ gridColumn: `span ${(5 - (filteredOutfits.length % 5)) % 5}` }} />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 sm:min-h-[calc(100dvh-8rem)]">
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed text-center">
              {outfits.length > 0 ? dict.outfits.noMatchFilters : dict.lookbook.noSavedOutfits}
            </p>
          </div>
        )}
      </div>

      {/* Filter bottom sheet */}
      <BottomSheet
        isOpen={showFilter}
        onClose={() => setShowFilter(false)}
      >
        <div className="px-5 pt-6 pb-24">
          <ColorFilterChips
            wardrobeItems={wardrobeItems}
            colorFilters={colorFilters}
            setColorFilters={setColorFilters}
          />
        </div>
      </BottomSheet>

      {/* Outfit detail bottom sheet */}
      <BottomSheet
        isOpen={selectedOutfit !== null}
        onClose={() => setSelectedOutfit(null)}
        overlayClose
        hideDesktopClose
      >
        {selectedOutfit && (
          <OutfitPiecesSheet
            outfit={selectedOutfit}
            saved={selectedOutfit.saved}
            onSave={handleToggleSave}
            onDelete={handleDeleteOutfit}
          />
        )}
      </BottomSheet>
    </ProtectedRoute>
  );
}
