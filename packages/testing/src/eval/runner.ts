/**
 * Run all golden cases for a given prompt.
 * Loads the prompt from DB, runs each case through the AI gateway,
 * applies assertions, and returns an EvalRun summary.
 *
 * NOTE: The AI gateway logs every call to the `generations` table including
 * cost and provenance. Eval runs share that infrastructure so the costs
 * show up in the same place as production.
 */
import { call, type AICallResult } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { loadGoldenCases } from './loader.js';
import { evaluateAssertions } from './assertions.js';
import type { CaseResult, EvalRun } from './types.js';

/**
 * The eval harness uses a stable system user so generations are attributable
 * but don't pollute real user accounts. Created via the seed-eval-user script.
 *
 * Override via EVAL_USER_ID env var to scope eval costs to a different user.
 */
const EVAL_USER_ID =
  process.env.EVAL_USER_ID ?? '00000000-0000-0000-0000-000000000001';

export async function runEval(
  promptName: string,
  options: { model?: string } = {},
): Promise<EvalRun> {
  const cases = await loadGoldenCases(promptName);
  const prompt = await getPrompt(promptName);

  const results: CaseResult[] = [];
  let totalCost = 0;
  let totalLatency = 0;

  for (const goldenCase of cases) {
    const start = performance.now();

    let aiResult: AICallResult<unknown>;
    let output = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let model = options.model ?? 'gpt-5.4-mini';
    let costCents = 0;
    let errorMessage: string | undefined;

    try {
      aiResult = await call({
        operation: `eval.${promptName}`,
        userId: EVAL_USER_ID,
        promptName: prompt.name,
        promptVersionId: prompt.versionId,
        promptTemplate: prompt.template,
        userPrompt: goldenCase.input.userPrompt,
        model,
        variables: goldenCase.input.variables,
        imageUrls: goldenCase.input.imageUrls,
        responseFormat: 'text', // gateway returns string for non-JSON; structural checks parse if needed
        temperature: 0.1, // deterministic-ish for eval reproducibility
      });
      output =
        typeof aiResult.data === 'string' ? aiResult.data : JSON.stringify(aiResult.data);
      costCents = aiResult.provenance.costCents;
      model = aiResult.provenance.model;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = performance.now() - start;

    let assertionResult = errorMessage
      ? { passed: false, reasons: [`AI call failed: ${errorMessage}`] }
      : evaluateAssertions(goldenCase, output, costCents, latencyMs);

    results.push({
      caseName: goldenCase.name,
      passed: assertionResult.passed,
      reasons: assertionResult.reasons,
      output,
      costCents,
      latencyMs,
      inputTokens,
      outputTokens,
      model,
    });

    totalCost += costCents;
    totalLatency += latencyMs;
  }

  return {
    promptName,
    promptVersionId: prompt.versionId,
    ranAt: new Date().toISOString(),
    totalCases: results.length,
    passedCases: results.filter((r) => r.passed).length,
    failedCases: results.filter((r) => !r.passed).length,
    totalCostCents: totalCost,
    avgLatencyMs: results.length > 0 ? totalLatency / results.length : 0,
    cases: results,
  };
}
