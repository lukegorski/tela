/**
 * Load golden cases from disk. Each prompt has a folder under
 * packages/testing/golden/<prompt-name>/ containing one YAML per case.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { GoldenCase } from './types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const GOLDEN_ROOT = join(__dirname, '..', '..', 'golden');

export async function loadGoldenCases(promptName: string): Promise<GoldenCase[]> {
  const dir = join(GOLDEN_ROOT, promptName);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new Error(
      `No golden cases for "${promptName}". Expected directory: ${dir}\n` +
        `Create it and add at least one .yaml file.`,
    );
  }

  const yamlFiles = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (yamlFiles.length === 0) {
    throw new Error(`No .yaml files found in ${dir}`);
  }

  const cases: GoldenCase[] = [];
  for (const file of yamlFiles) {
    const path = join(dir, file);
    const fileStat = await stat(path);
    if (!fileStat.isFile()) continue;
    const raw = await readFile(path, 'utf-8');
    const parsed = parseYaml(raw) as Partial<GoldenCase> | null;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`${path}: not valid YAML object`);
    }
    if (!parsed.input?.userPrompt) {
      throw new Error(`${path}: missing required input.userPrompt`);
    }
    cases.push({
      name: parsed.name ?? basename(file, extname(file)),
      description: parsed.description,
      input: parsed.input,
      expect: parsed.expect,
      maxCostCents: parsed.maxCostCents,
      maxLatencyMs: parsed.maxLatencyMs,
    });
  }
  return cases;
}

export async function listAvailablePrompts(): Promise<string[]> {
  try {
    const entries = await readdir(GOLDEN_ROOT, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
