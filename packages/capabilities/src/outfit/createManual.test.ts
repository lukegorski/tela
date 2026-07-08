import { describe, it, expect } from 'vitest';
import { manualComposition } from './createManual.js';

const base = { top: null, bottom: null, outerwear: null, shoes: null, dress: null };

describe('manualComposition (spec §3: (top AND bottom) OR dress)', () => {
  it('accepts top + bottom', () => {
    const r = manualComposition({ ...base, top: 'a', bottom: 'b' });
    expect(r).toEqual({
      ok: true,
      entries: [
        { role: 'top', closetItemId: 'a' },
        { role: 'bottom', closetItemId: 'b' },
      ],
    });
  });

  it('accepts a dress alone', () => {
    const r = manualComposition({ ...base, dress: 'd' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries).toEqual([{ role: 'dress', closetItemId: 'd' }]);
  });

  it('dress wins: top/bottom are dropped when a dress is set (pipeline semantics)', () => {
    const r = manualComposition({ ...base, dress: 'd', top: 'a', bottom: 'b', shoes: 's' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries.map((e) => e.role)).toEqual(['dress', 'shoes']);
  });

  it('rejects top without bottom (and vice versa)', () => {
    expect(manualComposition({ ...base, top: 'a' }).ok).toBe(false);
    expect(manualComposition({ ...base, bottom: 'b' }).ok).toBe(false);
    expect(manualComposition(base).ok).toBe(false);
  });

  it('outerwear and shoes ride along as optional', () => {
    const r = manualComposition({ ...base, top: 'a', bottom: 'b', outerwear: 'o', shoes: 's' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries.map((e) => e.role)).toEqual(['top', 'bottom', 'outerwear', 'shoes']);
  });

  it('rejects the same item in two slots', () => {
    const r = manualComposition({ ...base, top: 'a', bottom: 'a' });
    expect(r.ok).toBe(false);
  });
});
