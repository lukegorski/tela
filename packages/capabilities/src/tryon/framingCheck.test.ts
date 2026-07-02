import { describe, it, expect } from 'vitest';
import { parseFramingResult } from './framingCheck.js';

describe('parseFramingResult', () => {
  it('parses a full valid payload', () => {
    expect(
      parseFramingResult({ feetVisible: true, lowestVisiblePart: 'feet', framing: 'full-body' }),
    ).toEqual({ feetVisible: true, lowestVisiblePart: 'feet', framing: 'full-body' });
  });

  it('parses a cropped verdict', () => {
    expect(
      parseFramingResult({ feetVisible: false, lowestVisiblePart: 'thighs', framing: 'three-quarter' }),
    ).toEqual({ feetVisible: false, lowestVisiblePart: 'thighs', framing: 'three-quarter' });
  });

  it('tolerates missing optional fields', () => {
    expect(parseFramingResult({ feetVisible: false })).toEqual({
      feetVisible: false,
      lowestVisiblePart: null,
      framing: null,
    });
  });

  it('returns null for malformed payloads', () => {
    expect(parseFramingResult(null)).toBeNull();
    expect(parseFramingResult('yes')).toBeNull();
    expect(parseFramingResult({})).toBeNull();
    expect(parseFramingResult({ feetVisible: 'true' })).toBeNull();
    expect(parseFramingResult([])).toBeNull();
  });

  it('coerces wrong-typed optional fields to null rather than failing', () => {
    expect(parseFramingResult({ feetVisible: true, lowestVisiblePart: 7, framing: {} })).toEqual({
      feetVisible: true,
      lowestVisiblePart: null,
      framing: null,
    });
  });
});
