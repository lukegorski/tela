/**
 * Shapes of the data we read out of legacy Firestore. Hand-written instead
 * of imported from `/Users/lukegorski/ale/src/lib/types.ts` because that
 * file imports `firebase/firestore` (browser SDK) and brings React-flavored
 * types into the migration package — we just need the field shapes.
 *
 * Timestamps come back as `Timestamp` objects from firebase-admin/firestore;
 * we convert them to JS `Date` (`.toDate()`) at the boundary.
 */

export interface LegacyTryOnSettings {
  background: 'neutral' | 'chic-interior' | 'nighttime';
  model: 'self' | 'model-woman' | 'model-man';
  selfPhotoURL: string | null;
}

export interface LegacyLocation {
  city: string;
  country?: string;
  lat: number;
  lon: number;
  timezone: string;
  tempUnit: 'C' | 'F';
}

export interface LegacyUserProfile {
  uid?: string;
  email?: string;
  displayName?: string;
  onboardingComplete?: boolean;
  locale?: string;
  preferences?: {
    styleKeywords?: string[];
    favoriteColors?: string[];
    avoidColors?: string[];
    formality?: string;
    lifestyle?: string;
  };
  bodyInfo?: {
    bodyType?: string;
    height?: string;
    fitPreference?: string;
  };
  wardrobeGaps?: string[];
  tryOnSettings?: LegacyTryOnSettings;
  location?: LegacyLocation;
}

export interface LegacyAnalysis {
  category: 'top' | 'bottom' | 'outerwear' | 'dress' | 'shoes' | 'accessory';
  subcategory?: string;
  primaryColor?: string;
  secondaryColor?: string | null;
  pattern?: string;
  style?: string;
  season?: string[];
  formality?: number;
  material?: string;
  description?: string;
  fit?: string;
  length?: string;
  sleeveLength?: string;
}

export interface LegacyWardrobeItem {
  id: string;
  imageURL?: string;
  imagePath?: string;
  originalImageURL?: string;
  originalImagePath?: string;
  enhancementStatus?: 'enhancing' | 'completed' | 'failed';
  bgColor?: string;
  bgColors?: { tl: string; tr: string; bl: string; br: string };
  analysis: LegacyAnalysis;
  analysisLocale?: string;
  /** Firestore Timestamp. Convert with `.toDate()` at the read boundary. */
  createdAt: { toDate(): Date } | Date;
}

export interface LegacyOutfit {
  id: string;
  items: string[];
  pairingKey?: string;
  reasoning?: string;
  name?: string;
  occasion: string;
  season?: string[];
  saved?: boolean;
  feedback?: 'up' | 'down' | null;
  wardrobeAssessment?: string;
  /** Firestore Timestamps. */
  createdAt: { toDate(): Date } | Date;
  savedAt?: { toDate(): Date } | Date | null;
  // ─── Try-on fields (Phase 11 D3 / M4) ───
  tryOnImageURL?: string;
  tryOnStatus?: 'pending' | 'generating' | 'completed' | 'failed';
  tryOnStartedAt?: { toDate(): Date } | Date | null;
  tryOnAsyncJobId?: string | null;
  tryOnAsyncStep?: string | null;
  /** Legacy try-on model selection: 'self' | 'model-woman' | 'model-man' (untyped string in legacy). */
  model?: string;
}
