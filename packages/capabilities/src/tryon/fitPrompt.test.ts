import { describe, it, expect } from 'vitest';
import { buildFitPrompt } from './fitPrompt.js';

const base = { subcategory: null, fit: null, length: null, sleeveLength: null };

describe('buildFitPrompt', () => {
  it('falls back to regular fit garment when analysis fields are null', () => {
    expect(buildFitPrompt(base)).toBe('This is a regular fit garment.');
  });

  it('describes a standard-length item without a hem sentence', () => {
    expect(
      buildFitPrompt({ ...base, subcategory: 't-shirt', fit: 'slim', length: 'standard' }),
    ).toBe('This is a slim fit t-shirt.');
  });

  it('adds the waist hem sentence for cropped items', () => {
    expect(buildFitPrompt({ ...base, subcategory: 'jacket', fit: 'boxy', length: 'cropped' })).toBe(
      'This is a cropped boxy fit jacket. The hem ends at the natural waist, above the pants waistband.',
    );
  });

  it('adds the hip hem sentence for longline items', () => {
    expect(buildFitPrompt({ ...base, subcategory: 'coat', length: 'longline' })).toBe(
      'This is a longline regular fit coat. The hem extends well past the hip.',
    );
  });

  it('maps known sleeve lengths to natural phrasing', () => {
    expect(buildFitPrompt({ ...base, subcategory: 'shirt', sleeveLength: 'half' })).toBe(
      'This is a regular fit shirt. It has wide half-length sleeves.',
    );
    expect(buildFitPrompt({ ...base, subcategory: 'shirt', sleeveLength: 'long' })).toBe(
      'This is a regular fit shirt. It has long sleeves.',
    );
  });

  it('passes unknown sleeve lengths through verbatim', () => {
    expect(buildFitPrompt({ ...base, subcategory: 'shirt', sleeveLength: 'batwing' })).toBe(
      'This is a regular fit shirt. It has batwing.',
    );
  });

  it('omits the sleeve sentence for sleeveless and null', () => {
    expect(buildFitPrompt({ ...base, subcategory: 'vest', sleeveLength: 'sleeveless' })).toBe(
      'This is a regular fit vest.',
    );
    expect(buildFitPrompt({ ...base, subcategory: 'vest' })).toBe('This is a regular fit vest.');
  });

  it('appends the not-skin-tight guard for relaxed and oversized fits', () => {
    expect(buildFitPrompt({ ...base, subcategory: 'hoodie', fit: 'oversized' })).toBe(
      'This is a oversized fit hoodie. Not skin-tight.',
    );
    expect(
      buildFitPrompt({ ...base, subcategory: 'tee', fit: 'relaxed', sleeveLength: 'short' }),
    ).toBe('This is a relaxed fit tee. It has short sleeves. Not skin-tight.');
  });
});
