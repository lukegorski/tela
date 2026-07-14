"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useScrollPersistence } from "@/hooks/useScrollPersistence";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useDictionary } from "@/components/DictionaryProvider";
import OutfitHero from "@/components/OutfitHero";
import OutfitGridCell from "@/components/OutfitGridCell";
import BottomSheet from "@/components/BottomSheet";
import OutfitPiecesSheet from "@/components/OutfitPiecesSheet";
import LoadingSpinner from "@/components/LoadingSpinner";
import ColorFilterChips from "@/components/ColorFilterChips";
import { useOutfits } from "@/hooks/useOutfits";
import { useWardrobe } from "@/hooks/useWardrobe";
import type { Outfit } from "@/lib/types";
import { OCCASION_OPTIONS } from "@/lib/types";

// (Legacy outfits page also has a first-time model picker triggered
// on !onboardingComplete. Skipped in D.7: D.5 quiz already sets
// onboardingComplete=true; default tryOnSettings.model='model-woman'
// works. Users change in /settings/try-on. Re-evaluate post-launch
// if user data shows users want to be forced to choose.)

export default function OutfitsPage() {
  return (
    <Suspense>
      <OutfitsPageContent />
    </Suspense>
  );
}

function OutfitsPageContent() {
  const { dict } = useDictionary();
  const searchParams = useSearchParams();
  const [occasion, setOccasion] = useState<string>("");
  const {
    outfits,
    loading,
    generating,
    error,
    generateOutfit,
    toggleSave,
    removeOutfit,
    triggerTryOn,
  } = useOutfits();
  const { items: wardrobeItems, loading: wardrobeLoading } = useWardrobe();
  const wardrobeCount = wardrobeLoading ? null : wardrobeItems.length;

  const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const previousGridState = useRef<{ mode: 2 | 3; scrollTop: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  useScrollPersistence("outfits-scroll", feedRef, !loading);

  // Filter state
  const [showFilter, setShowFilter] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [colorFilters, setColorFilters] = useState<string[]>([]);

  // Grid mode: 1 = full-screen hero, 2 = two-column, 3 = three-column
  const [gridMode, setGridMode] = useState<1 | 2 | 3>(2);
  const [transitioning, setTransitioning] = useState(false);
  // Restore saved grid mode from localStorage (avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem("outfits-grid-mode");
    if (saved === "1") setGridMode(1);
    else if (saved === "3") setGridMode(3);
  }, []);

  // Keep selectedOutfit in sync with the latest outfits data (e.g., after
  // toggleSave/refetch updates the saved flag, the open sheet should reflect it).
  useEffect(() => {
    if (!selectedOutfit) return;
    const fresh = outfits.find((o) => o.id === selectedOutfit.id);
    if (fresh && fresh !== selectedOutfit) setSelectedOutfit(fresh);
  }, [outfits, selectedOutfit]);

  function cycleGridMode() {
    if (transitioning) return;
    // Smart icon: if we came from a grid tap, return to that grid instead of cycling
    if (previousGridState.current) {
      swipeBackToGrid();
      return;
    }
    setTransitioning(true);
    setTimeout(() => {
      setGridMode((prev) => {
        const next = prev === 2 ? 3 : prev === 3 ? 1 : 2;
        localStorage.setItem("outfits-grid-mode", String(next));
        return next;
      });
      feedRef.current?.scrollTo({ top: 0 });
      setTransitioning(false);
    }, 150);
  }

  // Switch to hero view scrolled to the tapped outfit, then open detail sheet
  function switchToHeroAndSelect(outfit: Outfit) {
    if (transitioning) return;
    // Save current grid state for swipe-back
    previousGridState.current = {
      mode: gridMode as 2 | 3,
      scrollTop: feedRef.current?.scrollTop || 0,
    };
    setTransitioning(true);
    setTimeout(() => {
      setGridMode(1);
      localStorage.setItem("outfits-grid-mode", "1");
      setTransitioning(false);
      requestAnimationFrame(() => {
        const index = heroOutfits.findIndex((o) => o.id === outfit.id);
        const containerHeight = feedRef.current?.clientHeight || 0;
        const offset = generating ? 1 : 0;
        feedRef.current?.scrollTo({ top: (index + offset) * containerHeight });
        setTimeout(() => setSelectedOutfit(outfit), 150);
      });
    }, 150);
  }

  // Restore previous grid mode and scroll position
  function swipeBackToGrid() {
    if (!previousGridState.current || transitioning) return;
    const { mode, scrollTop } = previousGridState.current;
    previousGridState.current = null;
    const sheetOpen = selectedOutfit !== null;
    if (sheetOpen) setSelectedOutfit(null);
    setTransitioning(true);
    setTimeout(() => {
      setGridMode(mode);
      localStorage.setItem("outfits-grid-mode", String(mode));
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

  // Build item color lookup for filtering outfits by color
  const itemColorMap = useMemo(() => new Map(
    wardrobeItems.map((item) => [
      item.id,
      { primary: item.primaryColor, secondary: item.secondaryColor },
    ])
  ), [wardrobeItems]);

  // Dynamic occasion filters: only show occasions that have outfits.
  // Note: legacy normalized translated occasion values back to English keys
  // for backward compat with old data; our contexts.occasion is always
  // English so we just lowercase-compare directly.
  const availableOccasions = useMemo(() => {
    if (loading) return OCCASION_OPTIONS;
    const occs = new Set(outfits.map((o) => o.occasion.toLowerCase()));
    return OCCASION_OPTIONS.filter((opt) => occs.has(opt.toLowerCase()));
  }, [outfits, loading]);

  // Reset filter if the selected occasion no longer has outfits
  useEffect(() => {
    if (occasion && !availableOccasions.some((o) => o.toLowerCase() === occasion.toLowerCase())) {
      setOccasion("");
    }
  }, [availableOccasions, occasion]);

  // Filter outfits for hero feed display
  const heroOutfits = useMemo(() => outfits.filter((o) => {
    const matchesOccasion =
      !occasion || o.occasion.toLowerCase() === occasion.toLowerCase();
    const matchesColor =
      colorFilters.length === 0 ||
      o.items.some((item) => {
        const colors = itemColorMap.get(item.closetItemId);
        if (!colors) return false;
        return colorFilters.some(
          (c) =>
            colors.primary.toLowerCase() === c ||
            (colors.secondary && colors.secondary.toLowerCase() === c)
        );
      });
    return matchesOccasion && matchesColor;
  }), [outfits, occasion, colorFilters, itemColorMap]);

  // Deep-link: if ?id= is present, switch to hero view and scroll to that outfit
  const deepLinkedId = searchParams.get("id");
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (!deepLinkedId || deepLinkHandled.current || heroOutfits.length === 0) return;
    const index = heroOutfits.findIndex((o) => o.id === deepLinkedId);
    if (index < 0) return;
    deepLinkHandled.current = true;
    setGridMode(1);
    requestAnimationFrame(() => {
      if (feedRef.current) {
        const containerHeight = feedRef.current.clientHeight;
        const offset = generating ? 1 : 0;
        feedRef.current.scrollTo({ top: (index + offset) * containerHeight });
      }
    });
  }, [deepLinkedId, heroOutfits, generating]);

  const handleGenerate = useCallback(
    async (selectedOccasion?: string) => {
      try {
        await generateOutfit(selectedOccasion);
        setTimeout(() => {
          feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }, 500);
      } catch {
        // Hook surfaces the error via `error`; nothing extra to do here.
      }
    },
    [generateOutfit],
  );

  // Determine which state to show
  const hasWardrobe = wardrobeCount !== null && wardrobeCount >= 3;
  const hasHeroContent = heroOutfits.length > 0;

  return (
    <ProtectedRoute>
      {/* Mobile: fixed height for snap-scroll hero feed */}
      {/* Desktop: natural scroll for grid layout */}
      <div className="h-[calc(100dvh-4rem)] sm:h-auto flex flex-col bg-neutral-50 dark:bg-neutral-800 sm:bg-white sm:dark:bg-neutral-900">

      {/* Page header — shared mobile + desktop */}
      <header className="flex-none flex items-center justify-between px-4 pt-4 pb-3 bg-white dark:bg-neutral-900">
        <h1 className="text-sm font-semibold tracking-widest uppercase">{dict.outfits.title}</h1>
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
            aria-label="Filter outfits"
          >
            <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
              />
            </svg>
            {(occasion || colorFilters.length > 0) && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-neutral-900 dark:bg-neutral-100 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            disabled={generating || !hasWardrobe}
            className="p-1 disabled:opacity-30"
            aria-label="Generate outfit"
          >
            <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center sm:min-h-[calc(100dvh-8rem)]">
          <LoadingSpinner variant="auto" />
        </div>
      ) : !hasHeroContent && !generating ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:min-h-[calc(100dvh-8rem)]">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed text-center">
            {!hasWardrobe ? dict.outfits.wardrobeEmpty : dict.outfits.generatePrompt}
          </p>
        </div>
      ) : (
        <>
          {/* ===== MOBILE: Hero feed or grid, based on gridMode ===== */}
          <div className="flex-1 relative min-h-0 sm:hidden">
            <div
              ref={feedRef}
              className={`h-full overflow-y-auto bg-white dark:bg-neutral-900 ${gridMode === 1 ? "snap-y snap-mandatory" : ""}`}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className={`transition-opacity duration-150 ${transitioning ? "opacity-0" : "opacity-100"} ${gridMode === 1 ? "h-full" : ""}`}>
                {gridMode === 1 ? (
                  <>
                    {/* Generating: placeholder snap section with spinner */}
                    {generating && (
                      <section className="h-full snap-start relative flex items-center justify-center bg-white">
                        <LoadingSpinner />
                      </section>
                    )}

                    {heroOutfits.map((outfit) => (
                      <OutfitHero
                        key={outfit.id}
                        outfit={outfit}
                        onTap={() => setSelectedOutfit(outfit)}
                        onToggleSave={() => { void toggleSave(outfit.id, !outfit.saved); }}
                        onRequestTryOn={() => { void triggerTryOn(outfit.id, true); }}
                        onDelete={() => { void removeOutfit(outfit.id); }}
                      />
                    ))}
                  </>
                ) : (
                  <div className="relative min-h-full">
                    <div className={`grid ${gridMode === 2 ? "grid-cols-2" : "grid-cols-3"} gap-px bg-neutral-200 dark:bg-neutral-700`}>
                      {/* Generating: placeholder cell with spinner */}
                      {generating && (
                        <div className="bg-white aspect-[3/4] relative flex items-center justify-center">
                          <LoadingSpinner />
                        </div>
                      )}
                      {heroOutfits.map((outfit, i) => (
                        <div key={outfit.id} className="bg-white aspect-[3/4] relative">
                          <OutfitGridCell
                            outfit={outfit}
                            preload={i === 0}
                            hideOccasion={gridMode === 3}
                            onTap={() => switchToHeroAndSelect(outfit)}
                            onRequestTryOn={() => { void triggerTryOn(outfit.id, true); }}
                            onDelete={() => { void removeOutfit(outfit.id); }}
                          />
                        </div>
                      ))}
                      {(() => {
                        const totalCells = heroOutfits.length + (generating ? 1 : 0);
                        const remainder = totalCells % gridMode;
                        return remainder !== 0 ? (
                          <div className="bg-white dark:bg-neutral-900" style={{ gridColumn: `span ${gridMode - remainder}` }} />
                        ) : null;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="absolute top-16 inset-x-4 z-30 p-3 bg-red-500/90 backdrop-blur-sm text-white rounded-xl text-sm text-center">
                {error}
              </div>
            )}
          </div>

          {/* ===== DESKTOP: Grid layout with tall viewport-height cells ===== */}
          <div className="hidden sm:block flex-1 relative sm:min-h-[calc(100vh-10rem)]">
            {/* 5-column grid — each row fills from chips to bottom of viewport */}
            <div className="grid grid-cols-5 gap-px bg-neutral-200 dark:bg-neutral-700">
              {/* Generating: placeholder cell with spinner */}
              {generating && (
                <div className="bg-white h-[calc(100vh-10rem)] flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              )}
              {heroOutfits.map((outfit, i) => (
                <div key={outfit.id} className="bg-white h-[calc(100vh-10rem)]">
                  <OutfitGridCell
                    outfit={outfit}
                    preload={i === 0}
                    onTap={() => setSelectedOutfit(outfit)}
                    onRequestTryOn={() => { void triggerTryOn(outfit.id, true); }}
                    onDelete={() => { void removeOutfit(outfit.id); }}
                  />
                </div>
              ))}
              {(() => {
                const totalCells = heroOutfits.length + (generating ? 1 : 0);
                const remainder = totalCells % 5;
                return remainder !== 0 ? (
                  <div className="bg-white dark:bg-neutral-900" style={{ gridColumn: `span ${5 - remainder}` }} />
                ) : null;
              })()}
            </div>

            {error && (
              <div className="mx-4 mt-4 p-3 bg-red-500/90 text-white rounded-xl text-sm text-center">
                {error}
              </div>
            )}
          </div>
        </>
      )}

      </div>

      {/* Filter bottom sheet */}
      <BottomSheet
        isOpen={showFilter}
        onClose={() => setShowFilter(false)}
      >
        <div className="px-5 pt-6 pb-24">
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
            {dict.outfits.category}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setOccasion(""); setShowFilter(false); }}
              className={`px-4 py-2 rounded-none border-2 text-xs font-medium transition-colors ${
                occasion === ""
                  ? "border-stone-700 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "border-stone-200 dark:border-neutral-600 text-stone-700 dark:text-stone-300"
              }`}
            >
              {dict.common.all}
            </button>
            {availableOccasions.map((opt) => (
              <button
                key={opt}
                onClick={() => { setOccasion(occasion === opt ? "" : opt); setShowFilter(false); }}
                className={`px-4 py-2 rounded-none border-2 text-xs font-medium transition-colors ${
                  occasion === opt
                    ? "border-stone-700 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                    : "border-stone-200 dark:border-neutral-600 text-stone-700 dark:text-stone-300"
                }`}
              >
                {dict.constants.occasionOptions[opt as keyof typeof dict.constants.occasionOptions] ?? opt}
              </button>
            ))}
          </div>
          <ColorFilterChips
            wardrobeItems={wardrobeItems}
            colorFilters={colorFilters}
            setColorFilters={setColorFilters}
          />
        </div>
      </BottomSheet>

      {/* Generate outfit — occasion picker */}
      <BottomSheet
        isOpen={showGenerate}
        onClose={() => setShowGenerate(false)}
      >
        <div className="px-5 pt-6 pb-3">
          <h4 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            {dict.outfits.title}
          </h4>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide mt-1">
            {dict.outfits.generateAnOutfit}
          </h3>
        </div>
        <div className="px-5 pb-24">
          <div className="flex flex-wrap gap-2">
            {OCCASION_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => { setShowGenerate(false); void handleGenerate(opt); }}
                disabled={generating}
                className="px-4 py-2 rounded-none border-2 text-xs font-medium transition-colors border-stone-200 dark:border-neutral-600 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-neutral-800 disabled:opacity-30"
              >
                {dict.constants.occasionOptions[opt as keyof typeof dict.constants.occasionOptions] ?? opt}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>

      {/* Bottom sheet for pieces */}
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
            onSave={() => { void toggleSave(selectedOutfit.id, !selectedOutfit.saved); }}
            onDelete={() => {
              const id = selectedOutfit.id;
              setSelectedOutfit(null);
              setTimeout(() => { void removeOutfit(id); }, 500);
            }}
          />
        )}
      </BottomSheet>
    </ProtectedRoute>
  );
}
