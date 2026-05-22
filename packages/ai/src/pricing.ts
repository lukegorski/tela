import type { ModelPricing } from './types.js';

/**
 * Model pricing in cents per 1000 tokens (updated April 2026).
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5.4-mini': { inputCostPer1k: 0.075, outputCostPer1k: 0.45 },
  'gpt-5.4': { inputCostPer1k: 0.25, outputCostPer1k: 1.5 },
  'gpt-image-1.5': { inputCostPer1k: 0, outputCostPer1k: 5.0 },
  // Claude Sonnet 4: $3.00 / MTok input, $15.00 / MTok output → 0.3¢ / 1.5¢ per 1k tokens.
  'claude-sonnet-4-20250514': { inputCostPer1k: 0.3, outputCostPer1k: 1.5 },
};

/**
 * Calculate cost in fractional cents for a given model and token usage.
 * Matches by exact name first, then by longest prefix (handles dated model
 * variants like `gpt-5.4-mini-2026-03-17`).
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  let pricing = MODEL_PRICING[model];

  if (!pricing) {
    // Find the longest pricing key that the model name starts with
    let bestMatch = '';
    for (const key of Object.keys(MODEL_PRICING)) {
      if (model.startsWith(key) && key.length > bestMatch.length) {
        bestMatch = key;
      }
    }
    if (bestMatch) pricing = MODEL_PRICING[bestMatch];
  }

  if (!pricing) return 0;

  return (
    (inputTokens / 1000) * pricing.inputCostPer1k +
    (outputTokens / 1000) * pricing.outputCostPer1k
  );
}
