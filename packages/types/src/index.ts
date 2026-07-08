// ─── Core entity types ───

export interface UserPreferences {
  styleKeywords: string[];
  favoriteColors: string[];
  avoidColors: string[];
  formality: string;
  lifestyle: string;
}

export interface UserBodyInfo {
  bodyType: string;
  height: string;
  fitPreference: string;
}

export interface UserLocation {
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  tempUnit: 'C' | 'F';
}

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  authUserId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
  onboardingComplete: boolean;
  preferences: UserPreferences | null;
  bodyInfo: UserBodyInfo | null;
  location: UserLocation | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Closet {
  id: string;
  userId: string;
  itemCount: number;
  lastUpdatedAt: Date;
  createdAt: Date;
}

export interface ClosetItem {
  id: string;
  closetId: string;
  userId: string;
  photoId: string;
  enhancedPhotoId: string | null;
  backgroundColor: string | null;
  analysisLocale: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  pattern: string | null;
  formalityScore: number;
  materialWeight: MaterialWeight;
  seasonCompatibility: Season[];
  style: string | null;
  fit: string | null;
  length: string | null;
  sleeveLength: string | null;
  description: string | null;
  wearCount: number;
  lastWornAt: Date | null;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MaterialWeight = 'light' | 'medium' | 'heavy';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export interface ItemPhoto {
  id: string;
  userId: string;
  storagePath: string;
  width: number | null;
  height: number | null;
  capturedAt: Date | null;
  createdAt: Date;
}

// ─── Style profile ───

export interface StyleProfile {
  id: string;
  userId: string;
  profileText: string;
  dimensions: StyleDimensions;
  confidence: DimensionConfidence;
  signals: StyleSignal[];
  latestVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StyleDimensions {
  minimalMaximal: number;
  classicTrendy: number;
  casualFormal: number;
  subtleBold: number;
  structuredFluid: number;
}

export type DimensionConfidence = {
  [K in keyof StyleDimensions]: number;
};

export interface StyleSignal {
  tag: string;
  strength: number;
  source: 'closet_read' | 'feedback' | 'inference';
}

export interface StyleProfileVersion {
  id: string;
  profileId: string;
  userId: string;
  profileText: string;
  dimensions: StyleDimensions;
  confidence: DimensionConfidence;
  signals: StyleSignal[];
  reason: string;
  triggeredBy: string;
  createdAt: Date;
}

// ─── Context ───

export interface Context {
  id: string;
  userId: string;
  weather: WeatherSnapshot | null;
  timeOfDay: TimeOfDay;
  season: Season;
  occasion: Occasion;
  calendarContext: string | null;
  assembledAt: Date;
}

export interface WeatherSnapshot {
  temperatureCelsius: number;
  condition: string;
  humidity: number;
  windSpeedKph: number;
  location: string;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export type Occasion =
  | 'everyday'
  | 'work'
  | 'date_night'
  | 'formal'
  | 'weekend'
  | 'active'
  | 'travel';

// ─── Generation provenance ───

export interface Generation {
  id: string;
  userId: string;
  operation: string;
  promptName: string;
  promptVersionId: string;
  model: string;
  inputSnapshot: unknown;
  rawOutput: string;
  parsedOutput: unknown;
  latencyMs: number;
  costCents: number;
  createdAt: Date;
}

// ─── Outfits ───

export interface Outfit {
  id: string;
  userId: string;
  generationId: string;
  contextId: string;
  rationale: string;
  pairingKey: string;
  embedding: number[] | null;
  saved: boolean;
  wornAt: Date | null;
  createdAt: Date;
}

export type OutfitItemRole = 'top' | 'bottom' | 'dress' | 'shoes' | 'outerwear' | 'accessory';

export interface OutfitItem {
  id: string;
  outfitId: string;
  closetItemId: string;
  role: OutfitItemRole;
}

// ─── Prompts ───

export interface Prompt {
  id: string;
  name: string;
  description: string;
  latestVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  template: string;
  variables: string[];
  changelog: string | null;
  createdAt: Date;
}

// ─── Stylist knowledge ───

export interface AnnotatedExample {
  id: string;
  title: string;
  outfitDescription: string;
  reasoning: string;
  context: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StylistRule {
  id: string;
  category: string;
  rule: string;
  priority: number;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Wardrobe gaps ───

export interface WardrobeGap {
  id: string;
  userId: string;
  category: string;
  description: string;
  priority: number;
  identifiedAt: Date;
  resolvedAt: Date | null;
}

// ─── Event source ───
//
// Where a request originated. Mirrors CallSource in @tela/capabilities.
// Used for both event log attribution and authorization decisions.
export type EventSource = 'web' | 'mcp' | 'worker' | 'admin' | 'test';

// ─── Capability types ───

export interface CapabilityResult<T> {
  success: true;
  data: T;
}

export interface CapabilityError {
  success: false;
  error: string;
  code: string;
}

export type CapabilityResponse<T> = CapabilityResult<T> | CapabilityError;

export * from './builderRecipe.js';
