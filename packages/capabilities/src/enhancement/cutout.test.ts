import { describe, it, expect } from 'vitest';
import { applyAlphaCurve, computeTrim, ALPHA_LO, ALPHA_HI } from './cutoutImage.js';
import { cutoutEligibility } from './cutout.js';

function rgbaWithAlphas(alphas: number[]): Buffer {
  const buf = Buffer.alloc(alphas.length * 4);
  alphas.forEach((a, i) => {
    buf[i * 4] = 128;
    buf[i * 4 + 1] = 128;
    buf[i * 4 + 2] = 128;
    buf[i * 4 + 3] = a;
  });
  return buf;
}
const alphasOf = (buf: Buffer) => Array.from({ length: buf.length / 4 }, (_, i) => buf[i * 4 + 3]);

describe('applyAlphaCurve (spike-locked: LO=70, HI=190)', () => {
  it('kills background ghost below LO', () => {
    expect(alphasOf(applyAlphaCurve(rgbaWithAlphas([0, 30, 69, 70])))).toEqual([0, 0, 0, 0]);
  });

  it('saturates garment interior above HI', () => {
    expect(alphasOf(applyAlphaCurve(rgbaWithAlphas([190, 220, 255])))).toEqual([255, 255, 255]);
  });

  it('ramps linearly between LO and HI (soft edges preserved)', () => {
    const mid = Math.round(((130 - ALPHA_LO) * 255) / (ALPHA_HI - ALPHA_LO));
    expect(alphasOf(applyAlphaCurve(rgbaWithAlphas([130])))).toEqual([mid]);
    const ramp = alphasOf(applyAlphaCurve(rgbaWithAlphas([80, 120, 160, 185])));
    expect([...ramp]).toEqual([...ramp].sort((a, b) => a - b)); // monotonic
    expect(ramp.every((a) => a > 0 && a < 255)).toBe(true);
  });

  it('never touches color channels', () => {
    const out = applyAlphaCurve(rgbaWithAlphas([10, 200]));
    expect(out[0]).toBe(128);
    expect(out[4]).toBe(128);
  });
});

describe('computeTrim', () => {
  // 4×3 image, opaque block at x∈[1,2], y∈[1,1]
  function grid(width: number, height: number, opaque: Array<[number, number]>): Buffer {
    const buf = Buffer.alloc(width * height * 4);
    for (const [x, y] of opaque) buf[(y * width + x) * 4 + 3] = 255;
    return buf;
  }

  it('finds the opaque bounding box', () => {
    const trim = computeTrim(grid(4, 3, [[1, 1], [2, 1]]), 4, 3);
    expect(trim).toEqual({ x: 1, y: 1, w: 2, h: 1, imgW: 4, imgH: 3 });
  });

  it('ignores near-transparent pixels (alpha ≤ 16)', () => {
    const buf = grid(4, 3, [[2, 2]]);
    buf[(0 * 4 + 0) * 4 + 3] = 16; // below threshold — must not extend the box
    expect(computeTrim(buf, 4, 3)).toEqual({ x: 2, y: 2, w: 1, h: 1, imgW: 4, imgH: 3 });
  });

  it('returns null for a fully transparent image', () => {
    expect(computeTrim(grid(4, 3, []), 4, 3)).toBeNull();
  });
});

describe('cutoutEligibility', () => {
  const base = { cutoutStoragePath: null, enhancedStoragePath: 'u/p.jpg.enhanced.jpg', presentation: 'flat' };

  it('eligible for enhanced, non-folded, uncut photos', () => {
    expect(cutoutEligibility(base)).toEqual({ eligible: true, skippedReason: null });
  });

  it('idempotent: skips photos that already have a cutout', () => {
    expect(cutoutEligibility({ ...base, cutoutStoragePath: 'u/p.jpg.cutout.webp' })).toEqual({
      eligible: false,
      skippedReason: 'already_done',
    });
  });

  it('skips photos without an enhanced image', () => {
    expect(cutoutEligibility({ ...base, enhancedStoragePath: null })).toEqual({
      eligible: false,
      skippedReason: 'not_enhanced',
    });
  });

  it('skips folded-presentation items (spec #12: excluded until retaken)', () => {
    expect(cutoutEligibility({ ...base, presentation: 'folded' })).toEqual({
      eligible: false,
      skippedReason: 'folded_presentation',
    });
  });

  it('angled and unclassified items ARE eligible (only folded excludes)', () => {
    expect(cutoutEligibility({ ...base, presentation: 'angled' }).eligible).toBe(true);
    expect(cutoutEligibility({ ...base, presentation: null }).eligible).toBe(true);
  });
});
