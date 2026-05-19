"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { useScrollPersistence } from "@/hooks/useScrollPersistence";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomSheet from "@/components/BottomSheet";
import type { WardrobeItem } from "@/lib/types";
import { useWardrobe } from "@/hooks/useWardrobe";
import WardrobeItemCard, { type ImageDimensions } from "@/components/WardrobeItemCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CATEGORY_FILTERS, CATEGORY_MAP } from "@/lib/types";
import ColorFilterChips from "@/components/ColorFilterChips";
import { ItemDetailContent } from "@/components/ItemDetailContent";
import { useDictionary } from "@/components/DictionaryProvider";
import { t } from "@/lib/i18n";
import { colorNameToHex } from "@/lib/colors";

const CATEGORY_DISPLAY_ORDER = [
  "top", "outerwear", "dress", "bottom", "shoes", "accessory",
] as const;

const ENHANCING_STATUSES = new Set(["pending", "processing"]);
const FAILED_STATUSES = new Set(["failed"]);

function hexLightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function resizeImage(file: File, maxSize: number = 1200): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else {
          width = (width / height) * maxSize;
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to load image. The file format may not be supported."));
    };
    img.src = objectUrl;
  });
}

export default function WardrobePage() {
  const { dict } = useDictionary();
  const { items, loading, uploadItem, deleteItem } = useWardrobe();
  const [filter, setFilter] = useState("All");
  const [showFilter, setShowFilter] = useState(false);
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const selectedFilesRef = useRef(selectedFiles);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useScrollPersistence("wardrobe-scroll", scrollContainerRef, !loading);

  // Wrapper: updates ref synchronously so the async upload loop always reads current list.
  // The ref MUST be updated outside the functional updater — React 18 may defer the
  // updater callback to the render phase, leaving the ref stale between iterations.
  function updateFiles(updater: (prev: typeof selectedFiles) => typeof selectedFiles) {
    const next = updater(selectedFilesRef.current);
    selectedFilesRef.current = next;
    setSelectedFiles(next);
  }
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState<ImageDimensions | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [previewFullScreenIndex, setPreviewFullScreenIndex] = useState<number | null>(null);
  const [previewEdited, setPreviewEdited] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Grid mode: 1 = single column, 2 = two-column (default), 3 = three-column
  const [gridMode, setGridMode] = useState<1 | 2 | 3>(2);
  // Restore saved grid mode from localStorage (avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem("wardrobe-grid-mode");
    if (saved === "1") setGridMode(1);
    else if (saved === "3") setGridMode(3);
  }, []);

  function cycleGridMode() {
    setGridMode((prev) => {
      const next = prev === 2 ? 3 : prev === 3 ? 1 : 2;
      localStorage.setItem("wardrobe-grid-mode", String(next));
      return next;
    });
    window.scrollTo({ top: 0 });
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDeleteItem() {
    if (!selectedItem) return;
    const itemToDelete = selectedItem;
    setSelectedItem(null);
    setTimeout(() => {
      deleteItem(itemToDelete);
    }, 500);
  }

  // Dynamic category filters: only show categories that have items
  const availableCategories = useMemo(() => {
    if (loading) return CATEGORY_FILTERS.slice(1);
    const cats = new Set<string>();
    items.forEach((item) => cats.add(item.category));
    return CATEGORY_FILTERS.slice(1).filter((cat) => cats.has(CATEGORY_MAP[cat]));
  }, [items, loading]);

  // Reset filter if the selected category no longer has items
  useEffect(() => {
    if (filter !== "All" && !availableCategories.includes(filter as (typeof CATEGORY_FILTERS)[number])) {
      setFilter("All");
    }
  }, [availableCategories, filter]);

  const filteredItems = items.filter((item) => {
    const matchesCategory =
      filter === "All" || item.category === CATEGORY_MAP[filter];
    const matchesColor =
      colorFilters.length === 0 ||
      colorFilters.some(
        (c) =>
          item.primaryColor.toLowerCase() === c ||
          (item.secondaryColor &&
            item.secondaryColor.toLowerCase() === c)
      );
    return matchesCategory && matchesColor;
  });

  const groupedItems = CATEGORY_DISPLAY_ORDER
    .map((cat) => ({
      category: cat,
      items: filteredItems
        .filter((item) => item.category === cat)
        .sort((a, b) => {
          // Pin enhancing/failed items to the start of the row
          const aProcessing =
            a.enhancementStatus !== null &&
            (ENHANCING_STATUSES.has(a.enhancementStatus) || FAILED_STATUSES.has(a.enhancementStatus))
              ? 0
              : 1;
          const bProcessing =
            b.enhancementStatus !== null &&
            (ENHANCING_STATUSES.has(b.enhancementStatus) || FAILED_STATUSES.has(b.enhancementStatus))
              ? 0
              : 1;
          if (aProcessing !== bProcessing) return aProcessing - bProcessing;

          // Among processing items, newest first
          if (aProcessing === 0 && bProcessing === 0) {
            const aTime = new Date(a.createdAt).getTime();
            const bTime = new Date(b.createdAt).getTime();
            return bTime - aTime;
          }

          // Completed items: sort by color lightness (darkest first)
          const hexA = colorNameToHex(a.primaryColor);
          const hexB = colorNameToHex(b.primaryColor);
          const lightA = hexA ? hexLightness(hexA) : 128;
          const lightB = hexB ? hexLightness(hexB) : 128;
          return lightB - lightA;
        }),
    }))
    .filter((group) => group.items.length > 0);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Copy to array BEFORE clearing input — FileList is a live reference
    const fileArray = Array.from(files);
    e.target.value = "";

    let failCount = 0;
    const resized: { file: File; previewUrl: string }[] = [];

    for (const file of fileArray) {
      try {
        const r = await resizeImage(file);
        resized.push({ file: r, previewUrl: URL.createObjectURL(r) });
      } catch {
        failCount++;
      }
    }

    if (failCount > 0 && resized.length === 0) {
      setUploadError(dict.wardrobe.unsupportedFormat);
    } else if (failCount > 0) {
      setUploadError(t(dict.wardrobe.someFilesUnsupported, { count: String(failCount) }));
    } else {
      setUploadError(null);
    }

    if (resized.length > 0) {
      setSelectedFiles((prev) => [...prev, ...resized]);
    }
  }

  function handleCancel() {
    for (const f of selectedFiles) URL.revokeObjectURL(f.previewUrl);
    setSelectedFiles([]);
    setUploadError(null);
  }

  function handleRotateFile(index: number) {
    const entry = selectedFiles[index];
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Swap width/height for 90° rotation
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          URL.revokeObjectURL(entry.previewUrl);
          const rotatedFile = new File([blob], entry.file.name, { type: "image/jpeg" });
          const rotatedUrl = URL.createObjectURL(rotatedFile);
          setSelectedFiles((prev) =>
            prev.map((f, i) => (i === index ? { file: rotatedFile, previewUrl: rotatedUrl } : f))
          );
          setPreviewEdited(true);
        },
        "image/jpeg",
        0.8
      );
    };
    img.src = entry.previewUrl;
  }

  function handleRemoveFile(index: number) {
    setPreviewFullScreenIndex(null);
    updateFiles((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }

  async function handleAccept() {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    selectedFilesRef.current = [...selectedFiles];
    let failCount = 0;

    // Upload sequentially, always processing index 0.
    // updateFiles() updates selectedFilesRef.current synchronously so the
    // while-condition sees the shrunk list immediately — no duplicate uploads.
    while (selectedFilesRef.current.length > 0) {
      setUploadingIndex(0);
      const entry = selectedFilesRef.current[0];
      try {
        await uploadItem(entry.file);
        URL.revokeObjectURL(entry.previewUrl);
      } catch (err) {
        console.error("Wardrobe upload failed:", err);
        failCount++;
      }
      updateFiles((prev) => prev.filter((f) => f !== entry));
    }

    if (failCount > 0) setUploadError(dict.wardrobe.uploadFailed);
    setUploadingIndex(null);
    setUploading(false);
  }

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
      multiple
      onChange={handleFileSelected}
      className="hidden"
    />
  );

  // Preview / uploading overlay
  if (selectedFiles.length > 0) {
    return (
      <ProtectedRoute>
        {fileInput}
        <div className="bg-white dark:bg-neutral-900">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h1 className="text-sm font-semibold tracking-widest uppercase">
              {dict.wardrobe.newPieces}
            </h1>
            <div className={`flex items-center gap-3${uploading ? " invisible" : ""}`}>
              <button onClick={handleCancel} className="p-1" aria-label="Cancel">
                <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button onClick={handleAccept} className="p-1" aria-label="Upload items">
                <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="p-1" aria-label="Add more items">
                <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
          </div>

          {uploadError && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center py-3">{uploadError}</p>
          )}

          {/* Preview grid — same structure as wardrobe grid */}
          <div className="relative">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-neutral-200 dark:bg-neutral-700">
              {selectedFiles.map((entry, i) => (
                <div key={entry.previewUrl} className="relative bg-white">
                  <div className="aspect-[3/4] relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.previewUrl}
                      alt="Preview"
                      className={`w-full h-full object-cover${!uploading ? " cursor-pointer" : ""}`}
                      onClick={() => { if (!uploading) { setPreviewEdited(false); setPreviewFullScreenIndex(i); } }}
                    />
                    {/* Currently uploading: spinner overlay (matches WardrobeItemCard enhance) */}
                    {uploading && i === uploadingIndex && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50">
                        <LoadingSpinner />
                      </div>
                    )}
                    {/* Queued: subtle overlay + remove button */}
                    {uploading && uploadingIndex !== null && i > uploadingIndex && (
                      <>
                        <div className="absolute inset-0 z-10 bg-black/20" />
                        <button
                          onClick={() => handleRemoveFile(i)}
                          className="absolute top-1.5 right-1.5 z-20 w-6 h-6 bg-black/50 flex items-center justify-center"
                          aria-label="Remove"
                        >
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )}
                    {/* Not uploading: normal remove button */}
                    {!uploading && (
                      <button
                        onClick={() => handleRemoveFile(i)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 flex items-center justify-center"
                        aria-label="Remove"
                      >
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {selectedFiles.length % 2 === 1 && <div className="bg-white dark:bg-neutral-900 lg:hidden" />}
              {selectedFiles.length % 5 !== 0 && (
                <div className="hidden lg:block bg-white dark:bg-neutral-900" style={{ gridColumn: `span ${(5 - (selectedFiles.length % 5)) % 5}` }} />
              )}
            </div>
          </div>

        </div>

        {/* Full-screen image viewer with editing tools */}
        {previewFullScreenIndex !== null && selectedFiles[previewFullScreenIndex] && (
          <div
            className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
            onClick={() => setPreviewFullScreenIndex(null)}
          >
            {/* Rotate — top left */}
            <button
              className="absolute top-4 left-4 p-1 text-white/70 hover:text-white z-10"
              onClick={(e) => { e.stopPropagation(); handleRotateFile(previewFullScreenIndex); }}
              aria-label="Rotate"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
            </button>
            {/* Close (X) or Confirm (checkmark) — top right */}
            <button
              className="absolute top-4 right-4 p-1 text-white/70 hover:text-white z-10"
              onClick={() => setPreviewFullScreenIndex(null)}
              aria-label={previewEdited ? "Done" : "Close"}
            >
              {previewEdited ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedFiles[previewFullScreenIndex].previewUrl}
              alt="Full size"
              className="w-full h-full object-contain"
            />
          </div>
        )}
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      {fileInput}
      <div className="h-[calc(100dvh-4rem)] sm:h-auto flex flex-col bg-white dark:bg-neutral-900">
        {/* Header — Mango style: title left, plus icon right */}
        <div className="flex-none flex items-center justify-between px-4 pt-4 pb-3">
          <h1 className="text-sm font-semibold tracking-widest uppercase">
            {dict.wardrobe.title}
          </h1>
          <div className="flex items-center gap-3">
            {/* Grid mode toggle — mobile only */}
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
            {/* Filter button */}
            <button
              onClick={() => setShowFilter(true)}
              className="relative p-1"
              aria-label="Filter wardrobe"
            >
              <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                />
              </svg>
              {(filter !== "All" || colorFilters.length > 0) && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-neutral-900 dark:bg-neutral-100 rounded-full" />
              )}
            </button>
            {/* Add items button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1"
              aria-label="Choose from library"
            >
              <svg className="w-5 h-5 text-neutral-900 dark:text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error banner for file selection failures (e.g. unsupported format) */}
        {uploadError && selectedFiles.length === 0 && (
          <p className="flex-none text-sm text-red-600 dark:text-red-400 text-center py-3">{uploadError}</p>
        )}

        {/* Scrollable content area */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center sm:min-h-[calc(100dvh-8rem)]">
            <LoadingSpinner variant="auto" />
          </div>
        ) : groupedItems.length > 0 ? (
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col gap-px bg-neutral-200 dark:bg-neutral-700">
              {groupedItems.map(({ category, items: catItems }) => (
                <div
                  key={category}
                  className={`overflow-x-auto scrollbar-hide overscroll-x-contain snap-x bg-white dark:bg-neutral-900 ${
                    gridMode === 1 ? "snap-mandatory" : "snap-proximity"
                  }`}
                >
                  <div className="flex gap-px bg-neutral-200 dark:bg-neutral-700" style={{ width: "max-content" }}>
                    {catItems.map((item) => (
                      <div
                        key={item.id}
                        className={`bg-white shrink-0 snap-start ${
                          gridMode === 1
                            ? "w-screen lg:w-[calc((100vw-4px)/5)]"
                            : gridMode === 3
                              ? "w-[calc((100vw-2px)/3)] lg:w-[calc((100vw-4px)/5)]"
                              : "w-[calc((100vw-1px)/2)] lg:w-[calc((100vw-4px)/5)]"
                        }`}
                      >
                        <WardrobeItemCard
                          item={item}
                          hideMetadata={gridMode === 3}
                          sizes={
                            gridMode === 1
                              ? "(min-width: 1024px) 20vw, 100vw"
                              : gridMode === 3
                                ? "(min-width: 1024px) 20vw, 33vw"
                                : "(min-width: 1024px) 20vw, 50vw"
                          }
                          onTap={(itm, dims) => { setSelectedItem(itm); setSelectedDimensions(dims); }}
                          onDelete={() => deleteItem(item)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : items.length > 0 ? (
          <div className="flex-1 flex items-center justify-center sm:min-h-[calc(100dvh-8rem)]">
            <p className="text-center text-neutral-400 dark:text-neutral-500 text-sm">
              {t(dict.wardrobe.noFilterResults, { filter: (dict.constants.categoryFilters[filter as keyof typeof dict.constants.categoryFilters] ?? filter).toLowerCase() })}
            </p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center px-6 sm:min-h-[calc(100dvh-8rem)]">
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed text-center">
              {dict.wardrobe.emptyPrompt}
              <br />
              {dict.wardrobe.addItemsPrompt}
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
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
            {dict.outfits.category}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setFilter("All"); setShowFilter(false); }}
              className={`px-4 py-2 rounded-none border-2 text-xs font-medium transition-colors ${
                filter === "All"
                  ? "border-stone-700 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "border-stone-200 dark:border-neutral-600 text-stone-700 dark:text-stone-300"
              }`}
            >
              {dict.common.all}
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setFilter(filter === cat ? "All" : cat); setShowFilter(false); }}
                className={`px-4 py-2 rounded-none border-2 text-xs font-medium transition-colors ${
                  filter === cat
                    ? "border-stone-700 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                    : "border-stone-200 dark:border-neutral-600 text-stone-700 dark:text-stone-300"
                }`}
              >
                {dict.constants.categoryFilters[cat as keyof typeof dict.constants.categoryFilters] ?? cat}
              </button>
            ))}
          </div>
          <ColorFilterChips
            wardrobeItems={items}
            colorFilters={colorFilters}
            setColorFilters={setColorFilters}
          />
        </div>
      </BottomSheet>

      {/* Item detail bottom sheet */}
      <BottomSheet
        isOpen={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        overlayClose
        hideDesktopClose
      >
        {selectedItem && (
          <ItemDetailContent
            item={selectedItem}
            dimensions={selectedDimensions}
            onImageTap={(url) => setFullScreenImage(url)}
            onDelete={handleDeleteItem}
          />
        )}
      </BottomSheet>


      {/* Full-screen image viewer */}
      {fullScreenImage && (
        <div
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setFullScreenImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-1 text-white/70 hover:text-white z-10"
            onClick={() => setFullScreenImage(null)}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <Image
            src={fullScreenImage}
            alt="Full size"
            fill
            sizes="100vw"
            className="object-contain"
          />
        </div>
      )}
    </ProtectedRoute>
  );
}
