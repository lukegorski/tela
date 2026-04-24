import type { z } from 'zod';
import type { Capability, RegisteredCapability } from './types.js';
import { buildEventBase, getObservabilityHooks } from './observability.js';
import { tryGetRequestContext } from './context/requestContext.js';

const registry = new Map<string, RegisteredCapability>();

/**
 * Thrown when a non-admin RequestContext attempts to call an
 * `requiresAdmin: true` capability. The tRPC layer surfaces this as a
 * FORBIDDEN error.
 */
export class AdminRequiredError extends Error {
  readonly code = 'ADMIN_REQUIRED' as const;
  constructor(capabilityName: string) {
    super(
      `Capability "${capabilityName}" requires admin privileges. ` +
        'The current RequestContext is not flagged isAdmin.',
    );
    this.name = 'AdminRequiredError';
  }
}

/**
 * Register a capability in the global registry.
 * The wrapper:
 *   - enforces requiresAdmin against the current RequestContext (if set)
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

  const requiresAdmin = capability.requiresAdmin === true;

  registry.set(capability.name, {
    name: capability.name,
    description: capability.description,
    inputSchema: capability.input,
    outputSchema: capability.output,
    requiresAdmin,
    execute: async (rawInput: unknown) => {
      const hooks = getObservabilityHooks();
      const start = performance.now();
      const baseEvent = buildEventBase(capability.name);

      hooks.onStart?.(baseEvent);

      try {
        // Admin gate. We only enforce when there's an active RequestContext —
        // a missing context is its own error (raised inside the capability via
        // getRequestContext()), so we defer to that more specific message.
        if (requiresAdmin) {
          const ctx = tryGetRequestContext();
          if (ctx && !ctx.isAdmin) {
            throw new AdminRequiredError(capability.name);
          }
        }

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
