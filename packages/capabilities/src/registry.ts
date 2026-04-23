import type { z } from 'zod';
import type { Capability, RegisteredCapability } from './types.js';

const registry = new Map<string, RegisteredCapability>();

/**
 * Register a capability in the global registry.
 * This is called at module load time for each capability.
 */
export function registerCapability<TInput extends z.ZodType, TOutput extends z.ZodType>(
  capability: Capability<TInput, TOutput>,
): Capability<TInput, TOutput> {
  if (registry.has(capability.name)) {
    throw new Error(`Capability already registered: ${capability.name}`);
  }

  registry.set(capability.name, {
    name: capability.name,
    description: capability.description,
    inputSchema: capability.input,
    outputSchema: capability.output,
    execute: async (rawInput: unknown) => {
      const validated = capability.input.parse(rawInput);
      const result = await capability.execute(validated);
      return capability.output.parse(result);
    },
  });

  return capability;
}

/**
 * Get a registered capability by name.
 */
export function getCapability(name: string): RegisteredCapability | undefined {
  return registry.get(name);
}

/**
 * Get all registered capabilities.
 * Used by the MCP server and tRPC router to expose all operations.
 */
export function getAllCapabilities(): RegisteredCapability[] {
  return Array.from(registry.values());
}

/**
 * Execute a capability by name with raw input.
 * Handles input validation, execution, and output validation.
 */
export async function executeCapability(name: string, input: unknown): Promise<unknown> {
  const capability = registry.get(name);
  if (!capability) {
    throw new Error(`Unknown capability: ${name}`);
  }
  return capability.execute(input);
}
