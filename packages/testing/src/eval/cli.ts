#!/usr/bin/env node
/**
 * tela-eval CLI — runs golden cases for a prompt and prints a report.
 *
 * Usage:
 *   doppler run -- pnpm --filter @tela/testing eval <prompt-name> [--json]
 *   doppler run -- pnpm --filter @tela/testing eval --list
 *
 * Exit code 0 on all-pass, 1 on any-fail. Suitable for CI use.
 */
import { runEval } from './runner.js';
import { listAvailablePrompts } from './loader.js';
import type { EvalRun } from './types.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  if (args[0] === '--list') {
    const prompts = await listAvailablePrompts();
    if (prompts.length === 0) {
      console.log('No golden case directories found in packages/testing/golden/');
      process.exit(0);
    }
    console.log('Available prompts with golden cases:');
    prompts.forEach((p) => console.log(`  ${p}`));
    process.exit(0);
  }

  const promptName = args[0];
  const jsonOutput = args.includes('--json');

  let run: EvalRun;
  try {
    run = await runEval(promptName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (jsonOutput) console.log(JSON.stringify({ error: message }));
    else console.error(`Error: ${message}`);
    process.exit(2);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(run, null, 2));
  } else {
    printHumanReport(run);
  }

  process.exit(run.failedCases > 0 ? 1 : 0);
}

function printUsage() {
  console.log(`tela-eval — prompt evaluation harness

Usage:
  pnpm --filter @tela/testing eval <prompt-name> [--json]
  pnpm --filter @tela/testing eval --list

Examples:
  pnpm --filter @tela/testing eval item.analyze
  pnpm --filter @tela/testing eval profile.derive_dimensions --json

Add new golden cases by dropping a YAML file in:
  packages/testing/golden/<prompt-name>/<case-name>.yaml
`);
}

function printHumanReport(run: EvalRun) {
  const totalCostStr = run.totalCostCents.toFixed(4);
  const avgLatencyStr = Math.round(run.avgLatencyMs).toString();

  console.log(`\n  ${run.promptName}  (version ${run.promptVersionId.slice(0, 8)}…)`);
  console.log(`  ${'─'.repeat(60)}`);

  for (const c of run.cases) {
    const mark = c.passed ? '✓' : '✗';
    const cost = c.costCents.toFixed(4) + '¢';
    const latency = Math.round(c.latencyMs) + 'ms';
    const meta = `${cost.padStart(8)}  ${latency.padStart(7)}`;
    console.log(`  ${mark} ${c.caseName.padEnd(40)} ${meta}`);
    if (!c.passed) {
      for (const reason of c.reasons) {
        console.log(`      ${reason}`);
      }
    }
  }

  console.log(`  ${'─'.repeat(60)}`);
  const passLine = `${run.passedCases}/${run.totalCases} passed`;
  console.log(
    `  ${passLine.padEnd(40)}  ${(totalCostStr + '¢').padStart(8)}  ${avgLatencyStr + 'ms avg'}`,
  );
  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
