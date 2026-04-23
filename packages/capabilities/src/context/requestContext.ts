/**
 * RequestContext — the auth-derived ambient context for every capability call.
 *
 * Every entry point into the system (tRPC handler, MCP tool dispatch, worker job
 * pickup, script invocation) is responsible for creating a RequestContext with
 * a verified identity and running the work inside it. Capabilities then read
 * the context at the point of use.
 *
 * Threaded via AsyncLocalStorage so capabilities don't have to plumb it through
 * every function signature.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { EventSource } from '@tela/types';

// CallSource is just an alias for EventSource — they should never diverge.
export type CallSource = EventSource;

export interface RequestContext {
  /** The authenticated user this request is acting on behalf of */
  userId: string;
  /** Where the request originated — used for event logging and authorization decisions */
  source: CallSource;
  /** Optional request correlation ID, for tracing across logs */
  requestId?: string;
  /** True if this context was created via a service-account token (MCP, workers, scripts) */
  isServiceAccount?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function inside a request context.
 * The context is available via getRequestContext() anywhere in the call tree.
 */
export function runInContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Get the current request context. Throws if called outside any context —
 * which is the right behavior, since every capability requires authentication.
 */
export function getRequestContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      'No RequestContext available. Capabilities must be called inside runInContext(). ' +
        'This usually means a tRPC route is missing the auth middleware, or a script ' +
        'forgot to wrap its capability calls.',
    );
  }
  return ctx;
}

/**
 * Get the current context if one exists, or null. Use sparingly — most code
 * should require a context.
 */
export function tryGetRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}
