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

/**
 * One piece inside an outfit. Mirrors the `richOutfitItemSchema` returned
 * by outfit.list / outfit.get / outfit.save / outfit.setFeedback.
 *
 * Has everything needed to render the item-grid fallback, color-filter
 * chips, and the pieces sheet without a second wardrobe round-trip.
 */
export interface OutfitItem {
  closetItemId: string;
  /** "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" */
  role: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  backgroundColor: string | null;
  imageUrl: string | null;
  originalImageUrl: string | null;
}

/**
 * Latest try-on job for an outfit. `null` when no job has ever been
 * started (first visit / never tapped Try On). Status follows the
 * worker-side state machine: pending → running → complete | failed.
 */
export interface OutfitTryOn {
  jobId: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  resultUrl: string | null;
  costCents: number;
  error: string | null;
  /** Layered pipeline step ('bottoms'|'top'|'outerwear'|'dress'); always null for the dress + standard pipelines. */
  asyncStep: 'bottoms' | 'top' | 'outerwear' | 'dress' | null;
  model: string | null;
}

export interface OutfitTranslation {
  rationale?: string;
  name?: string;
  wardrobeAssessment?: string;
}

/**
 * Full outfit shape — what useOutfits returns and what the legacy ports
 * (OutfitGridCell, OutfitHero, OutfitPiecesSheet, OutfitCard) consume.
 *
 * Mirrors the capability `richOutfitSchema`. Single `season` (was string[]
 * in legacy — we collapsed to one tag because contexts.season is single).
 * Translations field is empty for now (translation capability deferred).
 */
export interface Outfit {
  id: string;
  generationId: string;
  contextId: string;
  rationale: string;
  name: string | null;
  wardrobeAssessment: string | null;
  pairingKey: string;
  occasion: string;
  season: string;
  saved: boolean;
  savedAt: string | null;
  feedback: 'up' | 'down' | null;
  wornAt: string | null;
  createdAt: string;
  items: OutfitItem[];
  tryOn: OutfitTryOn | null;
  translations?: Record<string, OutfitTranslation>;
}

export const OCCASION_OPTIONS = [
  'Everyday',
  'Work',
  'Date Night',
  'Formal',
  'Weekend',
] as const;

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
