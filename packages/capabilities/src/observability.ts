/**
 * Optional observability hooks for capability execution.
 *
 * The capabilities package doesn't depend on Sentry, pino, or OTel directly —
 * those are runtime concerns owned by the consuming app (apps/api, apps/mcp).
 * Apps register hooks at startup; the registry's wrapper invokes them around
 * every capability execution.
 *
 * If no hooks are registered, capabilities execute silently (current behavior,
 * useful for tests).
 */
import { tryGetRequestContext } from './context/requestContext.js';

export interface CapabilityExecutionEvent {
  capabilityName: string;
  /** Resolved if a request context is active; null otherwise */
  userId: string | null;
  source: string | null;
  requestId: string | null;
}

export interface CapabilityCompletedEvent extends CapabilityExecutionEvent {
  durationMs: number;
}

export interface CapabilityErrorEvent extends CapabilityExecutionEvent {
  durationMs: number;
  error: Error;
}

export interface ObservabilityHooks {
  onStart?: (event: CapabilityExecutionEvent) => void;
  onComplete?: (event: CapabilityCompletedEvent) => void;
  onError?: (event: CapabilityErrorEvent) => void;
}

let hooks: ObservabilityHooks = {};

/**
 * Set the observability hooks. Call once at app startup.
 * Calling again replaces the previous hooks.
 */
export function setObservabilityHooks(newHooks: ObservabilityHooks): void {
  hooks = newHooks;
}

export function getObservabilityHooks(): ObservabilityHooks {
  return hooks;
}

/**
 * Build a base event payload from the current request context (if any).
 * Used by the registry to construct events without depending on the context module
 * directly in every place.
 */
export function buildEventBase(capabilityName: string): CapabilityExecutionEvent {
  const ctx = tryGetRequestContext();
  return {
    capabilityName,
    userId: ctx?.userId ?? null,
    source: ctx?.source ?? null,
    requestId: ctx?.requestId ?? null,
  };
}
