/**
 * Builder composition recipe v2.1 (spec §3 "Recipe v2" + "Sizing & proportion").
 *
 * Single source of truth for garment placement — consumed by the builder
 * canvas AND the save-card renderer. Pure math, no dependencies, unit-tested.
 *
 * v2.1: ONE SHARED SCALE. Founder dogfood (2026-07-13) showed per-item
 * height caps destroying cross-role proportion — a sweater rendered 2.2×
 * the width of the pants under it because the pants' height cap crushed
 * only the pants. Now every garment's width target comes from a real-world
 * flat-lay footprint table (cm), a single px-per-cm factor is chosen so the
 * tightest constraint still fits, and caps scale the WHOLE ensemble
 * uniformly. Cross-role proportion holds by construction:
 *   rendered(top)/rendered(bottom) === footprintCm(top)/footprintCm(bottom).
 *
 * Retained from v2: EDGE anchoring (shoulders/waist/floor are stable body
 * landmarks; length extends downward) and deterministic Tier-0 sizing
 * (subcategory table × fit multiplier, NULL-safe — identical inputs always
 * render identically).
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
  /** Fallback flat-lay footprint width when the subcategory is unknown (cm). */
  defaultCm: number;
  /** Which trim edge pins to the body landmark. */
  anchor: 'top' | 'bottom';
  /** Landmark position as a fraction of canvas height. */
  anchorY: number;
  /** Zone height available to this role (fraction of canvas height). */
  maxHFrac: number;
  /** Hard width ceiling (fraction of canvas width) — safety, rarely binds. */
  maxWFrac: number;
  z: number;
}

export const ROLE_SPECS: Record<BuilderRole, RoleSpec> = {
  outerwear: { defaultCm: 58, anchor: 'top', anchorY: 0.06, maxHFrac: 0.5, maxWFrac: 0.92, z: 30 },
  top: { defaultCm: 54, anchor: 'top', anchorY: 0.1, maxHFrac: 0.44, maxWFrac: 0.88, z: 20 },
  dress: { defaultCm: 48, anchor: 'top', anchorY: 0.1, maxHFrac: 0.72, maxWFrac: 0.8, z: 20 },
  bottom: { defaultCm: 42, anchor: 'top', anchorY: 0.415, maxHFrac: 0.54, maxWFrac: 0.7, z: 10 },
  shoes: { defaultCm: 27, anchor: 'bottom', anchorY: 0.985, maxHFrac: 0.16, maxWFrac: 0.5, z: 40 },
};

/**
 * Flat-lay footprint widths (cm) — what the garment's TRIM BOX spans in a
 * v2 canonical-pose photo (tops include relaxed-sleeve spill; bottoms are
 * waist/hip span with legs vertical). Deterministic, auditable, hand-tuned
 * against founder closets. Unknown subcategories fall back to the role
 * default — worst case degrades to proportionate role averages.
 */
export const SUBCATEGORY_FOOTPRINT_CM: Record<string, number> = {
  // tops
  'tank top': 42,
  camisole: 41,
  'strapless top': 43,
  blouse: 52,
  'lace blouse': 52,
  't-shirt': 54,
  'polo shirt': 55,
  'button-up shirt': 57,
  'dress shirt': 57,
  sweater: 62,
  'knit polo sweater': 60,
  hoodie: 64,
  // bottoms
  leggings: 33,
  shorts: 42,
  skirt: 44,
  jeans: 42,
  pants: 42,
  trousers: 42,
  'cargo pants': 45,
  // outerwear
  cardigan: 60,
  jacket: 63,
  'hooded jacket': 66,
  coat: 65,
  // shoes (pair, side by side)
  flats: 24,
  sandals: 24,
  'heeled sandals': 24,
  mules: 24,
  'mary jane flats': 24,
  loafers: 26,
  sneakers: 27,
  boots: 29,
  // dresses
  'slip dress': 44,
  'summer dress': 48,
};

export const FIT_MULTIPLIERS: Record<string, number> = {
  oversized: 1.12,
  relaxed: 1.05,
  slim: 0.92,
  tailored: 0.96,
};

const FIT_CLAMP: [number, number] = [0.85, 1.2];

/**
 * Tier-0 footprint for an item, in cm. NULL-safe and deterministic.
 */
export function footprintCm(role: BuilderRole, sizing?: SizingInput | null): number {
  const spec = ROLE_SPECS[role];
  const base = sizing?.subcategory
    ? (SUBCATEGORY_FOOTPRINT_CM[sizing.subcategory.toLowerCase()] ?? spec.defaultCm)
    : spec.defaultCm;
  const fitRaw = sizing?.fit ? (FIT_MULTIPLIERS[sizing.fit.toLowerCase()] ?? 1) : 1;
  const fit = Math.min(FIT_CLAMP[1], Math.max(FIT_CLAMP[0], fitRaw));
  return base * fit;
}

export interface OutfitSlotInput {
  trim: TrimBox;
  sizing?: SizingInput | null;
}

/**
 * The largest px-per-cm scale at which ONE item still fits its zone.
 */
function maxScaleFor(role: BuilderRole, trim: TrimBox, cm: number, canvasW: number, canvasH: number): number {
  const spec = ROLE_SPECS[role];
  const aspect = trim.h / trim.w; // rendered height per rendered width
  const byHeight = (spec.maxHFrac * canvasH) / (cm * aspect);
  const byWidth = (spec.maxWFrac * canvasW) / cm;
  return Math.min(byHeight, byWidth);
}

/** Rendered-garment width the ensemble aims for when nothing binds (fraction of canvas per cm of a 54cm top). */
const TARGET_TOP_WIDTH_FRAC = 0.62;
const REFERENCE_TOP_CM = 54;

function placeAt(
  role: BuilderRole,
  trim: TrimBox,
  cm: number,
  pxPerCm: number,
  canvasW: number,
  canvasH: number,
): PlacedRect {
  const spec = ROLE_SPECS[role];
  const s = (cm * pxPerCm) / trim.w; // image scale so the trim spans cm×pxPerCm
  const anchorPx = spec.anchorY * canvasH;
  const top = spec.anchor === 'top' ? anchorPx - trim.y * s : anchorPx - (trim.y + trim.h) * s;
  const left = canvasW / 2 - (trim.x + trim.w / 2) * s;
  return { left, top, drawW: trim.imgW * s, drawH: trim.imgH * s, z: spec.z };
}

/**
 * Place a full composition at ONE shared px-per-cm scale: proportions
 * between garments always match their real-world footprints; the scale is
 * the largest that lets every present garment fit its zone (capped at a
 * pleasant default so a lone small item doesn't balloon).
 */
export function placeOutfit(
  slots: Partial<Record<BuilderRole, OutfitSlotInput>>,
  canvasW: number,
  canvasH: number,
): Partial<Record<BuilderRole, PlacedRect>> {
  const present = (Object.entries(slots) as Array<[BuilderRole, OutfitSlotInput | undefined]>).filter(
    (e): e is [BuilderRole, OutfitSlotInput] => !!e[1],
  );
  if (present.length === 0) return {};

  // Effective footprints; when layered, an inner top never out-spans its
  // outer layer (oversized knit under a slim jacket).
  const cms = new Map<BuilderRole, number>();
  for (const [role, slot] of present) cms.set(role, footprintCm(role, slot.sizing));
  const outerCm = cms.get('outerwear');
  const topCm = cms.get('top');
  if (outerCm !== undefined && topCm !== undefined && topCm > outerCm * 0.95) {
    cms.set('top', outerCm * 0.95);
  }

  const defaultScale = (TARGET_TOP_WIDTH_FRAC * canvasW) / REFERENCE_TOP_CM;
  let pxPerCm = defaultScale;
  for (const [role, slot] of present) {
    pxPerCm = Math.min(pxPerCm, maxScaleFor(role, slot.trim, cms.get(role)!, canvasW, canvasH));
  }

  const out: Partial<Record<BuilderRole, PlacedRect>> = {};
  for (const [role, slot] of present) {
    out[role] = placeAt(role, slot.trim, cms.get(role)!, pxPerCm, canvasW, canvasH);
  }
  return out;
}

/**
 * Place a single garment (zone previews). Uses the same footprint system,
 * capped by its own zone — consistent with how it will look in an ensemble
 * unless another garment binds the shared scale tighter.
 */
export function placeItem(
  role: BuilderRole,
  trim: TrimBox,
  canvasW: number,
  canvasH: number,
  sizing?: SizingInput | null,
): PlacedRect {
  const cm = footprintCm(role, sizing);
  const pxPerCm = Math.min(
    (TARGET_TOP_WIDTH_FRAC * canvasW) / REFERENCE_TOP_CM,
    maxScaleFor(role, trim, cm, canvasW, canvasH),
  );
  return placeAt(role, trim, cm, pxPerCm, canvasW, canvasH);
}
