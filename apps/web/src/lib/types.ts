/**
 * Shared frontend types. The wardrobe-related shapes mirror the rich
 * output of the `wardrobe.listItems` / `wardrobe.getItem` capabilities.
 *
 * Timestamps are ISO strings (not Firestore Timestamps).
 * Background is a single hex (not a 4-corner gradient).
 * Analysis fields are flat (not nested under `analysis.X`).
 */

/**
 * Per-locale display strings for an item. Translations are deferred (no
 * `translation.translateLocale` capability yet); the field stays in the
 * type so legacy reader components compile and silently fall back to
 * English when the field is undefined.
 */
export interface WardrobeItemTranslation {
  subcategory?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  material?: string;
  pattern?: string;
  style?: string;
}

export interface WardrobeItem {
  id: string;
  closetId: string;
  photoId: string;
  enhancedPhotoId: string | null;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  pattern: string | null;
  style: string | null;
  fit: string | null;
  length: string | null;
  sleeveLength: string | null;
  description: string | null;
  formalityScore: number;
  materialWeight: string;
  material: string | null;
  seasonCompatibility: string[];
  analysisLocale: string;
  wearCount: number;
  lastWornAt: string | null;
  createdAt: string;
  /** 'pending' | 'processing' | 'complete' | 'failed' | 'skipped' | null */
  enhancementStatus: string | null;
  /** ISO timestamp; populated while enhancement is pending/processing — used for stale-check. */
  enhancementStartedAt: string | null;
  enhancedAt: string | null;
  backgroundColor: string | null;
  imageUrl: string | null;
  originalImageUrl: string | null;
  translations?: Record<string, WardrobeItemTranslation>;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export const CATEGORY_FILTERS = [
  "All",
  "Tops",
  "Bottoms",
  "Outerwear",
  "Dresses",
  "Shoes",
  "Accessories",
] as const;

export const CATEGORY_MAP: Record<string, string> = {
  Tops: "top",
  Bottoms: "bottom",
  Outerwear: "outerwear",
  Dresses: "dress",
  Shoes: "shoes",
  Accessories: "accessory",
};
