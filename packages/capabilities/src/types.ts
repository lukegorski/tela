import type { z } from 'zod';

/**
 * A capability is the fundamental unit of business logic in Tela.
 * Every operation the system can perform is defined as a capability.
 *
 * Capabilities are:
 * - Self-contained: input in, output out
 * - Self-validating: Zod schemas enforce contracts at runtime
 * - Self-documenting: name + description are used by MCP, tRPC, and tests
 * - Observable: every meaningful call logs events
 * - Authorized: every call filters by userId
 */
export interface Capability<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> {
  /** Unique name in domain.action format, e.g. 'wardrobe.addItem' */
  name: string;

  /** Human-readable description for MCP tool descriptions and documentation */
  description: string;

  /** Zod schema for input validation */
  input: TInput;

  /** Zod schema for output validation */
  output: TOutput;

  /**
   * If true, the registry rejects calls from non-admin RequestContexts with a
   * thrown Error before the handler runs. Service-account contexts (MCP,
   * workers, scripts) are treated as admin by the auth layer. Default: false.
   */
  requiresAdmin?: boolean;

  /** The business logic. Receives validated input, returns validated output. */
  execute: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

/**
 * A registered capability with runtime metadata.
 */
export interface RegisteredCapability {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  /** True if this capability is gated to admin RequestContexts only. */
  requiresAdmin: boolean;
  execute: (input: unknown) => Promise<unknown>;
}
