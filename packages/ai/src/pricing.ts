import type { ModelPricing } from './types.js';

/**
 * Model pricing in cents per 1000 tokens (updated April 2026).
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5.4-mini': { inputCostPer1k: 0.075, outputCostPer1k: 0.45 },
  'gpt-5.4': { inputCostPer1k: 0.25, outputCostPer1k: 1.5 },
  'gpt-image-1.5': { inputCostPer1k: 0, outputCostPer1k: 5.0 },
};

/**
 * Calculate cost in fractional cents for a given model and token usage.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  return (
    (inputTokens / 1000) * pricing.inputCostPer1k +
    (outputTokens / 1000) * pricing.outputCostPer1k
  );
}
