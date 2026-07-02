import { describe, it, expect } from 'vitest';
import { planPipeline, sliceForResume } from './pipeline.js';

const dress = { id: 'dress' };
const top = { id: 'top' };
const bottom = { id: 'bottom' };
const outerwear = { id: 'outerwear' };

describe('planPipeline', () => {
  it('plans a single one-pieces call for a dress', () => {
    const plan = planPipeline({ dress });
    expect(plan.pipeline).toBe('dress');
    expect(plan.steps).toEqual([
      { step: 'dress', item: dress, model: 'tryon-v1.6', category: 'one-pieces' },
    ]);
  });

  it('lets dress win over everything else (legacy parity)', () => {
    const plan = planPipeline({ dress, top, bottom, outerwear });
    expect(plan.pipeline).toBe('dress');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].step).toBe('dress');
  });

  it('plans bottoms-then-top on tryon-v1.6 for a standard outfit', () => {
    const plan = planPipeline({ top, bottom });
    expect(plan.pipeline).toBe('standard');
    expect(plan.steps).toEqual([
      { step: 'bottoms', item: bottom, model: 'tryon-v1.6', category: 'bottoms' },
      { step: 'top', item: top, model: 'tryon-v1.6', category: 'tops' },
    ]);
  });

  it('plans single-garment standard outfits', () => {
    expect(planPipeline({ top }).steps).toEqual([
      { step: 'top', item: top, model: 'tryon-v1.6', category: 'tops' },
    ]);
    expect(planPipeline({ bottom }).steps).toEqual([
      { step: 'bottoms', item: bottom, model: 'tryon-v1.6', category: 'bottoms' },
    ]);
  });

  it('plans v1.6 → tryon-max → edit for a layered outfit', () => {
    const plan = planPipeline({ top, bottom, outerwear });
    expect(plan.pipeline).toBe('layered');
    expect(plan.steps).toEqual([
      { step: 'bottoms', item: bottom, model: 'tryon-v1.6', category: 'bottoms' },
      { step: 'top', item: top, model: 'tryon-max' },
      { step: 'outerwear', item: outerwear, model: 'edit' },
    ]);
  });

  it('still applies outerwear when a layered outfit is missing a piece', () => {
    expect(planPipeline({ bottom, outerwear }).steps.map((s) => s.step)).toEqual([
      'bottoms',
      'outerwear',
    ]);
    expect(planPipeline({ outerwear }).steps.map((s) => s.step)).toEqual(['outerwear']);
  });

  it('returns an empty standard plan when there is nothing to try on', () => {
    const plan = planPipeline({});
    expect(plan.pipeline).toBe('standard');
    expect(plan.steps).toEqual([]);
  });
});

describe('sliceForResume', () => {
  const layered = planPipeline({ top, bottom, outerwear }).steps;

  it('resumes mid-pipeline at the named step', () => {
    expect(sliceForResume(layered, 'top')?.map((s) => s.step)).toEqual(['top', 'outerwear']);
  });

  it('re-runs the full plan when resuming at the first step', () => {
    expect(sliceForResume(layered, 'bottoms')).toEqual(layered);
  });

  it('resumes at the last step alone', () => {
    expect(sliceForResume(layered, 'outerwear')?.map((s) => s.step)).toEqual(['outerwear']);
  });

  it('returns null when the step is no longer in the plan', () => {
    const standard = planPipeline({ top, bottom }).steps;
    expect(sliceForResume(standard, 'dress')).toBeNull();
    expect(sliceForResume(standard, 'outerwear')).toBeNull();
  });
});
