/**
 * Types for the prompt evaluation harness.
 *
 * A "golden case" is a YAML file describing one input + expectations for
 * what a prompt's output should look like. Each prompt has a folder under
 * packages/testing/golden/<prompt-name>/ containing one YAML per case.
 */

export interface GoldenCase {
  /** Human-readable name for this case (filename minus .yaml is the default) */
  name: string;
  /** Optional description of what this case verifies */
  description?: string;
  /**
   * The input passed to the AI gateway call. Must include `userPrompt` and
   * may include `variables` and `imageUrls`. Other fields (model, etc.) come
   * from the prompt template / capability defaults.
   */
  input: {
    userPrompt: string;
    variables?: Record<string, string>;
    imageUrls?: string[];
  };
  /** Expected behavior of the output. All listed assertions must pass. */
  expect?: {
    /** The output must be valid JSON (default true for json prompts, false otherwise) */
    isValidJson?: boolean;
    /** The output (or stringified output) must contain these substrings (case-insensitive) */
    contains?: string[];
    /** The output (or stringified output) must NOT contain these substrings (case-insensitive) */
    lacks?: string[];
    /** When the output is JSON: required keys at the top level */
    hasKeys?: string[];
    /** When the output is JSON: each key→type assertion */
    keyTypes?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null'>;
    /** Output length must be between [min, max] characters */
    lengthBetween?: [number, number];
    /** Custom assertions: a list of human-readable rubric items for LLM-as-judge (Phase 6.5) */
    rubric?: string[];
  };
  /** Hard cost ceiling — fail the case if the call costs more than this in cents */
  maxCostCents?: number;
  /** Hard latency ceiling — fail the case if the call takes more than this in ms */
  maxLatencyMs?: number;
}

export interface CaseResult {
  caseName: string;
  passed: boolean;
  reasons: string[];
  output: string;
  costCents: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** The model the gateway actually returned (may be a dated variant) */
  model: string;
}

export interface EvalRun {
  promptName: string;
  promptVersionId: string;
  ranAt: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  totalCostCents: number;
  avgLatencyMs: number;
  cases: CaseResult[];
}
