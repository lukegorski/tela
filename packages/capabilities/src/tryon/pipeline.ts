/**
 * Pure planning logic for the try-on pipeline: which Fashn model runs for
 * which garment, in what order, and where to pick up after a crashed
 * attempt. Kept free of DB/Fashn imports so it unit-tests without mocks.
 *
 * Pipeline shapes (legacy parity — see legacy route.ts / advance/route.ts):
 *   dress    — single tryon-v1.6 call (one-pieces). Dress wins over
 *              everything else: a dress + outerwear outfit renders the
 *              dress only, exactly like legacy.
 *   standard — tryon-v1.6 per garment, bottoms then top.
 *   layered  — outerwear present: bottoms via tryon-v1.6, top via
 *              tryon-max (prompt-guided), outerwear layered on via edit.
 */
import type { TryOnStep } from '@tela/db';
import type { FashnCategory } from '@tela/ai';

export type TryOnPipeline = 'dress' | 'standard' | 'layered';

export type PlannedStep<Item> =
  | {
      /** Garment being applied — the resume cursor written to async_step. */
      step: TryOnStep;
      item: Item;
      model: 'tryon-v1.6';
      category: FashnCategory;
    }
  | { step: TryOnStep; item: Item; model: 'tryon-max' }
  | { step: TryOnStep; item: Item; model: 'edit' };

export interface PlannedPipeline<Item> {
  pipeline: TryOnPipeline;
  /** Ordered steps. Empty when the outfit has no try-on-able pieces. */
  steps: PlannedStep<Item>[];
}

export function planPipeline<Item>(pieces: {
  dress?: Item;
  top?: Item;
  bottom?: Item;
  outerwear?: Item;
}): PlannedPipeline<Item> {
  if (pieces.dress) {
    return {
      pipeline: 'dress',
      steps: [{ step: 'dress', item: pieces.dress, model: 'tryon-v1.6', category: 'one-pieces' }],
    };
  }

  const steps: PlannedStep<Item>[] = [];
  if (pieces.outerwear) {
    if (pieces.bottom) {
      steps.push({ step: 'bottoms', item: pieces.bottom, model: 'tryon-v1.6', category: 'bottoms' });
    }
    if (pieces.top) {
      steps.push({ step: 'top', item: pieces.top, model: 'tryon-max' });
    }
    steps.push({ step: 'outerwear', item: pieces.outerwear, model: 'edit' });
    return { pipeline: 'layered', steps };
  }

  if (pieces.bottom) {
    steps.push({ step: 'bottoms', item: pieces.bottom, model: 'tryon-v1.6', category: 'bottoms' });
  }
  if (pieces.top) {
    steps.push({ step: 'top', item: pieces.top, model: 'tryon-v1.6', category: 'tops' });
  }
  return { pipeline: 'standard', steps };
}

/**
 * Steps still to run when resuming a crashed attempt at `resumeStep`
 * (async_step names the garment that was about to be applied — the
 * in-flight step is re-run, so at most one Fashn call is duplicated).
 * Returns null when resumeStep is not in the plan — the outfit's items
 * changed between attempts and the caller must restart from scratch.
 */
export function sliceForResume<Item>(
  steps: PlannedStep<Item>[],
  resumeStep: TryOnStep,
): PlannedStep<Item>[] | null {
  const idx = steps.findIndex((s) => s.step === resumeStep);
  return idx === -1 ? null : steps.slice(idx);
}
