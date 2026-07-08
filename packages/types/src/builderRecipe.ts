/**
 * Builder composition recipe v2 (spec §3, "Recipe v2" + "Sizing & proportion").
 *
 * Single source of truth for garment placement — consumed by the builder
 * canvas AND the save-card renderer. Pure math, no dependencies, unit-tested.
 *
 * v2 vs the spike module:
 *  1. EDGE anchoring: tops/dresses pin at the shoulder line (top edge),
 *     bottoms at the waist (top edge), shoes at the floor (bottom edge).
 *     Body landmarks are stable; garment length extends DOWNWARD. The
 *     spike's center-anchoring floated necklines — a latent bug its
 *     same-length test closets never exposed.
 *  2. Relational layering clamp: an inner layer never renders wider than
 *     its outer layer (top ≤ outerwear × 0.92).
 *  3. Tier-0 deterministic sizing: per-subcategory reference factor ×
 *     fit multiplier from closet_items.fit, NULL-safe, clamped. Identical
 *     subcategory+fit always renders identically — re-analyzes cannot
 *     drift an item's size.
 *
 * Spike constants are the starting values (kit: coherence grid); anchors
 * re-derived from them at the v2 port.
 */

export type BuilderRole = 'top' | 'bottom' | 'outerwear' | 'shoes' | 'dress';

export interface TrimBox {
  x: number;
  y: number;
  w: number;
  h: number;
  imgW: number;
  imgH: number;
}

export interface PlacedRect {
  left: number;
  top: number;
  drawW: number;
  drawH: number;
  z: number;
}

export interface SizingInput {
  subcategory: string | null;
  fit: string | null;
}

interface RoleSpec {
  /** Garment (trim-box) width target as a fraction of canvas width. */
  baseWidthFrac: number;
  /** Which trim edge pins to the body landmark. */
  anchor: 'top' | 'bottom';
  /** Landmark position as a fraction of canvas height. */
  anchorY: number;
  /** Cap on rendered trim-box height as a fraction of canvas height. */
  maxHFrac: number;
  z: number;
}

export const ROLE_SPECS: Record<BuilderRole, RoleSpec> = {
  outerwear: { baseWidthFrac: 0.9, anchor: 'top', anchorY: 0.06, maxHFrac: 0.5, z: 30 },
  top: { baseWidthFrac: 0.74, anchor: 'top', anchorY: 0.1, maxHFrac: 0.44, z: 20 },
  dress: { baseWidthFrac: 0.72, anchor: 'top', anchorY: 0.1, maxHFrac: 0.72, z: 20 },
  bottom: { baseWidthFrac: 0.58, anchor: 'top', anchorY: 0.415, maxHFrac: 0.52, z: 10 },
  shoes: { baseWidthFrac: 0.34, anchor: 'bottom', anchorY: 0.985, maxHFrac: 0.16, z: 40 },
};

/** Spread-sleeve guard (spike): wide-aspect tops read too small in the torso. */
const SLEEVE_ASPECT_THRESHOLD = 1.15;
const SLEEVE_WIDTH_BOOST = 1.12;

/** Inner layers never render wider than the outer layer. */
export const LAYERING_RATIO = 0.92;

/** Tier-0 sizing (spec §3): deterministic, auditable, tunable by hand. */
export const FIT_MULTIPLIERS: Record<string, number> = {
  oversized: 1.12,
  relaxed: 1.05,
  slim: 0.92,
  tailored: 0.96,
};

export const SUBCATEGORY_WIDTH_FACTORS: Record<string, number> = {
  // tops
  'tank top': 0.82,
  camisole: 0.82,
  'strapless top': 0.85,
  blouse: 0.95,
  'lace blouse': 0.95,
  't-shirt': 0.95,
  'polo shirt': 0.98,
  'button-up shirt': 1.0,
  'dress shirt': 1.0,
  sweater: 1.05,
  'knit polo sweater': 1.05,
  hoodie: 1.08,
  // bottoms
  leggings: 0.85,
  shorts: 0.9,
  skirt: 1.0,
  jeans: 1.0,
  pants: 1.0,
  trousers: 1.0,
  'cargo pants': 1.05,
  // outerwear
  cardigan: 0.98,
  jacket: 1.0,
  'hooded jacket': 1.08,
  coat: 1.05,
  // shoes
  flats: 0.9,
  sandals: 0.9,
  'heeled sandals': 0.9,
  mules: 0.9,
  'mary jane flats': 0.9,
  loafers: 0.95,
  sneakers: 1.0,
  boots: 1.05,
};

const SIZING_CLAMP: [number, number] = [0.8, 1.25];

/**
 * Deterministic Tier-0 scale for an item. NULL-safe: unknown subcategory or
 * fit contribute 1.0, so worst case degrades to the spike behavior.
 */
export function sizingScale(sizing?: SizingInput | null): number {
  if (!sizing) return 1;
  const sub = sizing.subcategory ? (SUBCATEGORY_WIDTH_FACTORS[sizing.subcategory.toLowerCase()] ?? 1) : 1;
  const fit = sizing.fit ? (FIT_MULTIPLIERS[sizing.fit.toLowerCase()] ?? 1) : 1;
  const raw = sub * fit;
  return Math.min(SIZING_CLAMP[1], Math.max(SIZING_CLAMP[0], raw));
}

export interface PlaceOptions {
  /** Relational cap on the rendered garment (trim) width, in canvas px. */
  maxGarmentWidthPx?: number;
}

/**
 * Place one garment on the canvas. Returns the draw rect for the FULL
 * source image (the cutout), positioned so the trim box lands on its
 * body landmark.
 */
/**
 * Sizing multiplies AFTER the base fit (width target vs height cap): for
 * tall garments the height cap decides the base scale, and applying the
 * Tier-0 multiplier afterwards keeps size differentiation alive — an
 * oversized sweater must render larger than a regular tee even when both
 * are height-capped. A final safety guard keeps extremes on canvas.
 */
export function placeItem(
  role: BuilderRole,
  trim: TrimBox,
  canvasW: number,
  canvasH: number,
  sizing?: SizingInput | null,
  opts?: PlaceOptions,
): PlacedRect {
  const spec = ROLE_SPECS[role];
  let widthFrac = spec.baseWidthFrac;

  const aspect = trim.w / trim.h;
  if ((role === 'top' || role === 'outerwear' || role === 'dress') && aspect > SLEEVE_ASPECT_THRESHOLD) {
    widthFrac = Math.min(0.96, widthFrac * SLEEVE_WIDTH_BOOST);
  }

  // base fit: width target, constrained by the role's height cap
  let s = Math.min((widthFrac * canvasW) / trim.w, (spec.maxHFrac * canvasH) / trim.h);
  // Tier-0 sizing scales the garment on top of the base fit
  s *= sizingScale(sizing);
  // safety guards: never overflow the canvas meaningfully
  s = Math.min(s, (spec.maxHFrac * 1.15 * canvasH) / trim.h, (0.96 * canvasW) / trim.w);
  // relational layering cap (top under outerwear)
  if (opts?.maxGarmentWidthPx !== undefined && trim.w * s > opts.maxGarmentWidthPx) {
    s = opts.maxGarmentWidthPx / trim.w;
  }

  const anchorPx = spec.anchorY * canvasH;
  const top = spec.anchor === 'top' ? anchorPx - trim.y * s : anchorPx - (trim.y + trim.h) * s;
  const left = canvasW / 2 - (trim.x + trim.w / 2) * s;

  return { left, top, drawW: trim.imgW * s, drawH: trim.imgH * s, z: spec.z };
}

export interface OutfitSlotInput {
  trim: TrimBox;
  sizing?: SizingInput | null;
}

/**
 * Place a full composition, enforcing the relational layering clamp:
 * when outerwear is present, the top's rendered garment width is capped
 * at LAYERING_RATIO × outerwear's rendered garment width.
 */
export function placeOutfit(
  slots: Partial<Record<BuilderRole, OutfitSlotInput>>,
  canvasW: number,
  canvasH: number,
): Partial<Record<BuilderRole, PlacedRect>> {
  const out: Partial<Record<BuilderRole, PlacedRect>> = {};

  const outer = slots.outerwear;
  let topCapPx: number | undefined;
  if (outer) {
    const rect = placeItem('outerwear', outer.trim, canvasW, canvasH, outer.sizing);
    out.outerwear = rect;
    const outerScale = rect.drawW / outer.trim.imgW;
    topCapPx = outer.trim.w * outerScale * LAYERING_RATIO;
  }

  for (const role of ['dress', 'top', 'bottom', 'shoes'] as const) {
    const slot = slots[role];
    if (!slot) continue;
    out[role] = placeItem(role, slot.trim, canvasW, canvasH, slot.sizing, {
      maxGarmentWidthPx: role === 'top' ? topCapPx : undefined,
    });
  }

  return out;
}
