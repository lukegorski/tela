import type { z } from 'zod';
import type { Capability, RegisteredCapability } from './types.js';
import { buildEventBase, getObservabilityHooks } from './observability.js';

const registry = new Map<string, RegisteredCapability>();

/**
 * Register a capability in the global registry.
 * The wrapper:
 *   - validates input against the Zod schema
 *   - invokes onStart / onComplete / onError observability hooks
 *   - validates output against the Zod schema
 *   - re-throws errors after notifying hooks (apps decide how to surface them)
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
      const hooks = getObservabilityHooks();
      const start = performance.now();
      const baseEvent = buildEventBase(capability.name);

      hooks.onStart?.(baseEvent);

      try {
        const validated = capability.input.parse(rawInput);
        const result = await capability.execute(validated);
        const validatedOutput = capability.output.parse(result);

        hooks.onComplete?.({
          ...baseEvent,
          durationMs: performance.now() - start,
        });

        return validatedOutput;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        hooks.onError?.({
          ...baseEvent,
          durationMs: performance.now() - start,
          error,
        });
        throw error;
      }
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
