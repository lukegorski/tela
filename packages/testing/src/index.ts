// Prompt evaluation harness — see src/eval/.
// Most consumers use the CLI: `pnpm --filter @tela/testing eval <prompt>`.
// Programmatic use:
export { runEval } from './eval/runner.js';
export { loadGoldenCases, listAvailablePrompts } from './eval/loader.js';
export { evaluateAssertions } from './eval/assertions.js';
export type { GoldenCase, CaseResult, EvalRun } from './eval/types.js';
