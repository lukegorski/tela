import { describe, it, expect } from 'vitest';
import {
  placeItem,
  placeOutfit,
  sizingScale,
  ROLE_SPECS,
  LAYERING_RATIO,
  type TrimBox,
} from './builderRecipe.js';

const CW = 900;
const CH = 1200;

function trim(w: number, h: number, x = 100, y = 150, imgW = 1024, imgH = 1536): TrimBox {
  return { x, y, w, h, imgW, imgH };
}

const renderedTrimTop = (r: ReturnType<typeof placeItem>, t: TrimBox) =>
  r.top + t.y * (r.drawW / t.imgW);
const renderedTrimBottom = (r: ReturnType<typeof placeItem>, t: TrimBox) =>
  r.top + (t.y + t.h) * (r.drawW / t.imgW);
const renderedTrimWidth = (r: ReturnType<typeof placeItem>, t: TrimBox) =>
  t.w * (r.drawW / t.imgW);

describe('edge anchoring (v2 — necklines and waists are stable)', () => {
  it('two tops of different lengths share the same shoulder line', () => {
    // dims chosen so the height cap does NOT bind — pure width-fit regime
    const short = trim(700, 400);
    const long = trim(700, 520);
    const a = placeItem('top', short, CW, CH);
    const b = placeItem('top', long, CW, CH);
    expect(renderedTrimTop(a, short)).toBeCloseTo(ROLE_SPECS.top.anchorY * CH, 6);
    expect(renderedTrimTop(b, long)).toBeCloseTo(ROLE_SPECS.top.anchorY * CH, 6);
    // the longer top extends DOWNWARD, not upward
    expect(renderedTrimBottom(b, long)).toBeGreaterThan(renderedTrimBottom(a, short));
  });

  it('shoulder line holds even when the height cap binds (tall garments)', () => {
    const tall = trim(700, 1100);
    const r = placeItem('top', tall, CW, CH);
    expect(renderedTrimTop(r, tall)).toBeCloseTo(ROLE_SPECS.top.anchorY * CH, 6);
  });

  it('bottoms pin at the waist regardless of length', () => {
    const jeans = trim(500, 900);
    const shorts = trim(500, 400);
    expect(renderedTrimTop(placeItem('bottom', jeans, CW, CH), jeans)).toBeCloseTo(
      ROLE_SPECS.bottom.anchorY * CH,
      6,
    );
    expect(renderedTrimTop(placeItem('bottom', shorts, CW, CH), shorts)).toBeCloseTo(
      ROLE_SPECS.bottom.anchorY * CH,
      6,
    );
  });

  it('shoes pin at the floor by their bottom edge', () => {
    const boots = trim(400, 500);
    const sandals = trim(400, 200);
    expect(renderedTrimBottom(placeItem('shoes', boots, CW, CH), boots)).toBeCloseTo(
      ROLE_SPECS.shoes.anchorY * CH,
      6,
    );
    expect(renderedTrimBottom(placeItem('shoes', sandals, CW, CH), sandals)).toBeCloseTo(
      ROLE_SPECS.shoes.anchorY * CH,
      6,
    );
  });

  it('items are horizontally centered', () => {
    const t = trim(600, 700);
    const r = placeItem('top', t, CW, CH);
    const s = r.drawW / t.imgW;
    expect(r.left + (t.x + t.w / 2) * s).toBeCloseTo(CW / 2, 6);
  });
});

describe('Tier-0 deterministic sizing', () => {
  it('NULL-safe: no sizing input degrades to base behavior', () => {
    expect(sizingScale(null)).toBe(1);
    expect(sizingScale({ subcategory: null, fit: null })).toBe(1);
    expect(sizingScale({ subcategory: 'unknown thing', fit: 'weird' })).toBe(1);
  });

  it('an oversized sweater renders wider than a regular tee', () => {
    const t = trim(700, 600);
    const sweater = placeItem('top', t, CW, CH, { subcategory: 'sweater', fit: 'oversized' });
    const tee = placeItem('top', t, CW, CH, { subcategory: 't-shirt', fit: 'regular' });
    expect(renderedTrimWidth(sweater, t)).toBeGreaterThan(renderedTrimWidth(tee, t));
  });

  it('slim leggings render narrower than regular jeans', () => {
    const t = trim(450, 850);
    const leggings = placeItem('bottom', t, CW, CH, { subcategory: 'leggings', fit: 'slim' });
    const jeans = placeItem('bottom', t, CW, CH, { subcategory: 'jeans', fit: 'regular' });
    expect(renderedTrimWidth(leggings, t)).toBeLessThan(renderedTrimWidth(jeans, t));
  });

  it('sizing is clamped to [0.8, 1.25]', () => {
    expect(sizingScale({ subcategory: 'tank top', fit: 'slim' })).toBeGreaterThanOrEqual(0.8);
    expect(sizingScale({ subcategory: 'hoodie', fit: 'oversized' })).toBeLessThanOrEqual(1.25);
  });

  it('identical inputs always produce identical output (determinism)', () => {
    const t = trim(650, 720);
    const a = placeItem('top', t, CW, CH, { subcategory: 'sweater', fit: 'relaxed' });
    const b = placeItem('top', t, CW, CH, { subcategory: 'sweater', fit: 'relaxed' });
    expect(a).toEqual(b);
  });
});

describe('relational layering clamp', () => {
  it('an oversized top never renders wider than its jacket', () => {
    const topTrim = trim(900, 500); // wide sleeves → aspect boost too
    const outerTrim = trim(820, 700);
    const placed = placeOutfit(
      {
        top: { trim: topTrim, sizing: { subcategory: 'hoodie', fit: 'oversized' } },
        outerwear: { trim: outerTrim, sizing: { subcategory: 'cardigan', fit: 'slim' } },
      },
      CW,
      CH,
    );
    const topW = renderedTrimWidth(placed.top!, topTrim);
    const outerW = renderedTrimWidth(placed.outerwear!, outerTrim);
    expect(topW).toBeLessThanOrEqual(outerW * LAYERING_RATIO + 0.001);
  });

  it('without outerwear the top keeps its natural width', () => {
    const topTrim = trim(700, 600);
    const solo = placeOutfit({ top: { trim: topTrim } }, CW, CH);
    const alone = placeItem('top', topTrim, CW, CH);
    expect(solo.top).toEqual(alone);
  });

  it('z-order: bottom < top/dress < outerwear < shoes', () => {
    expect(ROLE_SPECS.bottom.z).toBeLessThan(ROLE_SPECS.top.z);
    expect(ROLE_SPECS.top.z).toBeLessThan(ROLE_SPECS.outerwear.z);
    expect(ROLE_SPECS.outerwear.z).toBeLessThan(ROLE_SPECS.shoes.z);
    expect(ROLE_SPECS.dress.z).toBe(ROLE_SPECS.top.z);
  });
});

describe('height caps', () => {
  it('a very tall dress is capped and stays anchored at the shoulder', () => {
    const gown = trim(500, 1400, 100, 60);
    const r = placeItem('dress', gown, CW, CH);
    const renderedH = gown.h * (r.drawW / gown.imgW);
    expect(renderedH).toBeLessThanOrEqual(ROLE_SPECS.dress.maxHFrac * CH + 0.001);
    expect(renderedTrimTop(r, gown)).toBeCloseTo(ROLE_SPECS.dress.anchorY * CH, 6);
  });
});
