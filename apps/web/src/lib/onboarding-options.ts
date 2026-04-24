/**
 * Onboarding option catalogs. Lifted verbatim from the production app's
 * src/lib/types.ts so the new app shows the same choices.
 */
export const STYLE_KEYWORDS = [
  'Minimalist',
  'Classic',
  'Streetwear',
  'Bohemian',
  'Preppy',
  'Sporty',
  'Avant-Garde',
  'Romantic',
  'Edgy',
  'Casual',
] as const;

export const COLOR_OPTIONS = [
  'Black',
  'White',
  'Navy',
  'Gray',
  'Beige',
  'Brown',
  'Olive',
  'Burgundy',
  'Cream',
  'Camel',
  'Rust',
  'Sage',
  'Terracotta',
  'Blush',
  'Cobalt',
  'Mustard',
] as const;

export const BODY_TYPES = [
  'Athletic',
  'Slim',
  'Curvy',
  'Plus-Size',
  'Petite',
] as const;

export const HEIGHT_OPTIONS = ['Petite', 'Average', 'Tall'] as const;

export const FIT_PREFERENCES = ['Fitted', 'Relaxed', 'Oversized'] as const;

export const FORMALITY_OPTIONS = [
  'Casual',
  'Business Casual',
  'Formal',
  'Mixed',
] as const;

export const LIFESTYLE_OPTIONS = [
  'Office',
  'Remote/WFH',
  'Active',
  'Social',
  'Mixed',
] as const;

/** Approximate hex colors for the swatches in the onboarding color picker. */
export const COLOR_HEX: Record<(typeof COLOR_OPTIONS)[number], string> = {
  Black: '#1a1a1a',
  White: '#ffffff',
  Navy: '#1c2c4e',
  Gray: '#7d7d7d',
  Beige: '#d8c8a8',
  Brown: '#6b4a2b',
  Olive: '#6b6b3a',
  Burgundy: '#722f3a',
  Cream: '#f5e9d0',
  Camel: '#b88a5e',
  Rust: '#a45a32',
  Sage: '#a4b39a',
  Terracotta: '#c2664a',
  Blush: '#e8c0c0',
  Cobalt: '#1a3a8e',
  Mustard: '#c8a02e',
};
