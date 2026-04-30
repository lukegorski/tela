/**
 * Public types for the legacy → new-app migration. Kept in a separate file
 * from `migrateLegacyUser.ts` so the CLI shell can import them without
 * pulling in the full firebase-admin / drizzle dependency tree at type time.
 */

export interface MigrateOptions {
  /** No DB writes or image uploads — just preview counts. */
  dryRun?: boolean;
  /** Restrict to a single section. Default 'all'. */
  only?: 'profile' | 'wardrobe' | 'outfits' | 'all';
  /**
   * Include image bytes transfer (Firebase Storage → Supabase Storage).
   * D.13a passes `false` to keep the first commit network-light; D.13b
   * passes `true`. When `false`, the wardrobe phase is also skipped — a
   * closet_items row without a working photo would render broken in
   * the new app. (`only: 'profile'` is the safe slice for D.13a.)
   */
  includeImages?: boolean;
  /**
   * Include outfit migration (synthetic context + generation + outfits +
   * outfit_items + partial-items rule). D.13a passes `false`; D.13b
   * passes `true`. Outfits depend on items, so outfits-only without
   * wardrobe will fail.
   */
  includeOutfits?: boolean;
}

export interface MigrateResult {
  durationMs: number;
  profile: {
    fieldsUpdated: string[];
  };
  wardrobe: {
    migrated: number;
    skipped: Array<{ legacyId: string; reason: string }>;
    imagesTransferred: number;
    imagesFailed: Array<{ legacyId: string; reason: string }>;
  };
  outfits: {
    migrated: number;
    skipped: Array<{ legacyId: string; reason: string }>;
    syntheticContextsCreated: number;
    syntheticGenerationsCreated: number;
  };
}

/**
 * Preview counts shown to the user during the M11 interactive confirmation
 * step. Computed by reading legacy Firestore but without any writes.
 */
export interface MigratePreview {
  legacyUid: string;
  legacyEmail: string;
  newUserId: string;
  newEmail: string;
  /** Names of profile fields the migration WOULD update on this run. */
  profileFieldsToUpdate: string[];
  wardrobeItemCount: number;
  outfitCount: number;
  /**
   * Distinct (occasion, validated-season) tuples derived from the user's
   * legacy outfits. `0` until outfits exist.
   */
  syntheticContextCount: number;
}
