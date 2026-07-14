import { describe, it, expect } from 'vitest';
import {
  placeItem,
  placeOutfit,
  footprintCm,
  ROLE_SPECS,
  SUBCATEGORY_FOOTPRINT_CM,
  type TrimBox,
  type PlacedRect,
} from './builderRecipe.js';

const CW = 900;
const CH = 1200;

function trim(w: number, h: number, x = 100, y = 150, imgW = 1024, imgH = 1536): TrimBox {
  return { x, y, w, h, imgW, imgH };
}

const scaleOf = (r: PlacedRect, t: TrimBox) => r.drawW / t.imgW;
const renderedTop = (r: PlacedRect, t: TrimBox) => r.top + t.y * scaleOf(r, t);
const renderedBottom = (r: PlacedRect, t: TrimBox) => r.top + (t.y + t.h) * scaleOf(r, t);
const renderedW = (r: PlacedRect, t: TrimBox) => t.w * scaleOf(r, t);
const renderedH = (r: PlacedRect, t: TrimBox) => t.h * scaleOf(r, t);

// Luke's dogfood case (2026-07-13): wide sweater over tall cargo pants.
const SWEATER = trim(900, 760);
const CARGOS = trim(560, 1240);
const sweaterSizing = { subcategory: 'sweater', fit: 'regular' };
const cargoSizing = { subcategory: 'cargo pants', fit: 'regular' };

describe('cross-role proportion (v2.1 — the founder-reported bug)', () => {
  it('sweater/cargo rendered widths match their footprint ratio even when the pants height cap binds', () => {
    const placed = placeOutfit(
      { top: { trim: SWEATER, sizing: sweaterSizing }, bottom: { trim: CARGOS, sizing: cargoSizing } },
      CW,
      CH,
    );
    const ratio = renderedW(placed.top!, SWEATER) / renderedW(placed.bottom!, CARGOS);
    const expected = footprintCm('top', sweaterSizing) / footprintCm('bottom', cargoSizing); // 62/45
    expect(ratio).toBeCloseTo(expected, 6);
    expect(ratio).toBeLessThan(1.5); // never the 2.2× regression
    // and the binding constraint is respected
    expect(renderedH(placed.bottom!, CARGOS)).toBeLessThanOrEqual(ROLE_SPECS.bottom.maxHFrac * CH + 0.001);
  });

  it('every placed garment shares ONE px-per-cm scale', () => {
    const shoes = trim(500, 260);
    const placed = placeOutfit(
      {
        top: { trim: SWEATER, sizing: sweaterSizing },
        bottom: { trim: CARGOS, sizing: cargoSizing },
        shoes: { trim: shoes, sizing: { subcategory: 'sneakers', fit: null } },
      },
      CW,
      CH,
    );
    const perCm = [
      renderedW(placed.top!, SWEATER) / footprintCm('top', sweaterSizing),
      renderedW(placed.bottom!, CARGOS) / footprintCm('bottom', cargoSizing),
      renderedW(placed.shoes!, shoes) / footprintCm('shoes', { subcategory: 'sneakers', fit: null }),
    ];
    expect(perCm[0]).toBeCloseTo(perCm[1], 6);
    expect(perCm[1]).toBeCloseTo(perCm[2], 6);
  });
});

describe('edge anchoring (stable body landmarks)', () => {
  it('tops of different lengths share the shoulder line; length extends downward', () => {
    const short = trim(700, 400);
    const long = trim(700, 620);
    const a = placeOutfit({ top: { trim: short } }, CW, CH).top!;
    const b = placeOutfit({ top: { trim: long } }, CW, CH).top!;
    expect(renderedTop(a, short)).toBeCloseTo(ROLE_SPECS.top.anchorY * CH, 6);
    expect(renderedTop(b, long)).toBeCloseTo(ROLE_SPECS.top.anchorY * CH, 6);
    expect(renderedBottom(b, long)).toBeGreaterThan(renderedBottom(a, short));
  });

  it('bottoms pin at the waist; shoes pin at the floor', () => {
    const placed = placeOutfit(
      { bottom: { trim: CARGOS, sizing: cargoSizing }, shoes: { trim: trim(500, 260) } },
      CW,
      CH,
    );
    expect(renderedTop(placed.bottom!, CARGOS)).toBeCloseTo(ROLE_SPECS.bottom.anchorY * CH, 6);
    expect(renderedBottom(placed.shoes!, trim(500, 260))).toBeCloseTo(ROLE_SPECS.shoes.anchorY * CH, 6);
  });

  it('garments are horizontally centered', () => {
    const t = trim(600, 700);
    const r = placeItem('top', t, CW, CH);
    const s = scaleOf(r, t);
    expect(r.left + (t.x + t.w / 2) * s).toBeCloseTo(CW / 2, 6);
  });
});

describe('Tier-0 deterministic sizing (footprints)', () => {
  it('is NULL-safe: unknown inputs fall back to role defaults', () => {
    expect(footprintCm('top', null)).toBe(ROLE_SPECS.top.defaultCm);
    expect(footprintCm('top', { subcategory: 'mystery garment', fit: 'weird' })).toBe(ROLE_SPECS.top.defaultCm);
  });

  it('an oversized sweater out-spans a regular one; leggings are narrower than jeans', () => {
    expect(footprintCm('top', { subcategory: 'sweater', fit: 'oversized' })).toBeGreaterThan(
      footprintCm('top', { subcategory: 'sweater', fit: 'regular' }),
    );
    expect(SUBCATEGORY_FOOTPRINT_CM.leggings).toBeLessThan(SUBCATEGORY_FOOTPRINT_CM.jeans);
  });

  it('identical inputs place identically (determinism)', () => {
    const a = placeOutfit({ top: { trim: SWEATER, sizing: sweaterSizing } }, CW, CH);
    const b = placeOutfit({ top: { trim: SWEATER, sizing: sweaterSizing } }, CW, CH);
    expect(a).toEqual(b);
  });
});

describe('layering + scale caps', () => {
  it('an oversized hoodie never out-spans its slim jacket', () => {
    const hoodie = trim(950, 800);
    const jacket = trim(880, 720);
    const placed = placeOutfit(
      {
        top: { trim: hoodie, sizing: { subcategory: 'hoodie', fit: 'oversized' } },
        outerwear: { trim: jacket, sizing: { subcategory: 'jacket', fit: 'slim' } },
      },
      CW,
      CH,
    );
    expect(renderedW(placed.top!, hoodie)).toBeLessThan(renderedW(placed.outerwear!, jacket));
  });

  it('a lone small garment does not balloon past the default ensemble scale', () => {
    const cami = trim(500, 600);
    const r = placeItem('top', cami, CW, CH, { subcategory: 'camisole', fit: null });
    expect(renderedW(r, cami)).toBeLessThanOrEqual(0.5 * CW);
  });

  it('z-order: bottom < top/dress < outerwear < shoes', () => {
    expect(ROLE_SPECS.bottom.z).toBeLessThan(ROLE_SPECS.top.z);
    expect(ROLE_SPECS.top.z).toBeLessThan(ROLE_SPECS.outerwear.z);
    expect(ROLE_SPECS.outerwear.z).toBeLessThan(ROLE_SPECS.shoes.z);
    expect(ROLE_SPECS.dress.z).toBe(ROLE_SPECS.top.z);
  });
});
