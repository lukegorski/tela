/**
 * Run the structural assertions defined in a golden case against the actual
 * AI output. Returns a list of human-readable failure reasons (empty = pass).
 */
import type { GoldenCase, CaseResult } from './types.js';

export function evaluateAssertions(
  goldenCase: GoldenCase,
  output: string,
  costCents: number,
  latencyMs: number,
): Pick<CaseResult, 'passed' | 'reasons'> {
  const reasons: string[] = [];
  const expect = goldenCase.expect ?? {};

  let parsed: unknown = undefined;
  let isJson = false;
  try {
    parsed = JSON.parse(output);
    isJson = true;
  } catch {
    isJson = false;
  }

  if (expect.isValidJson === true && !isJson) {
    reasons.push('output is not valid JSON');
  }
  if (expect.isValidJson === false && isJson) {
    reasons.push('output should not be JSON but parsed as one');
  }

  const haystack = output.toLowerCase();
  for (const needle of expect.contains ?? []) {
    if (!haystack.includes(needle.toLowerCase())) {
      reasons.push(`output is missing expected substring: "${needle}"`);
    }
  }
  for (const needle of expect.lacks ?? []) {
    if (haystack.includes(needle.toLowerCase())) {
      reasons.push(`output contains forbidden substring: "${needle}"`);
    }
  }

  if (expect.hasKeys && expect.hasKeys.length > 0) {
    if (!isJson || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      reasons.push('hasKeys check requires output to be a JSON object');
    } else {
      const obj = parsed as Record<string, unknown>;
      for (const key of expect.hasKeys) {
        if (!(key in obj)) reasons.push(`output missing required key: "${key}"`);
      }
    }
  }

  if (expect.keyTypes) {
    if (!isJson || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      reasons.push('keyTypes check requires output to be a JSON object');
    } else {
      const obj = parsed as Record<string, unknown>;
      for (const [key, expectedType] of Object.entries(expect.keyTypes)) {
        const actual = typeOf(obj[key]);
        if (actual !== expectedType) {
          reasons.push(`output.${key} expected ${expectedType}, got ${actual}`);
        }
      }
    }
  }

  if (expect.lengthBetween) {
    const [min, max] = expect.lengthBetween;
    if (output.length < min || output.length > max) {
      reasons.push(
        `output length ${output.length} outside expected range [${min}, ${max}]`,
      );
    }
  }

  if (goldenCase.maxCostCents !== undefined && costCents > goldenCase.maxCostCents) {
    reasons.push(
      `cost ${costCents.toFixed(4)}¢ exceeds maxCostCents ${goldenCase.maxCostCents}¢`,
    );
  }
  if (goldenCase.maxLatencyMs !== undefined && latencyMs > goldenCase.maxLatencyMs) {
    reasons.push(`latency ${Math.round(latencyMs)}ms exceeds maxLatencyMs ${goldenCase.maxLatencyMs}ms`);
  }

  return { passed: reasons.length === 0, reasons };
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
