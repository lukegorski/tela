import { logger } from './logger.js';

/**
 * Initialize OpenTelemetry instrumentation.
 *
 * This is a stub that will be fleshed out once the OTel export target
 * (Highlight, Axiom, or Honeycomb) is selected and configured.
 *
 * OTel must be initialized BEFORE any other imports that need tracing,
 * which is why this is a separate module imported first in index.ts.
 */
export function initOtel() {
  // TODO: Add OTel SDK initialization once export target is selected.
  // Will use @opentelemetry/sdk-node with:
  // - HttpInstrumentation for request tracing
  // - Custom spans for capability execution and AI gateway calls
  // - Export to selected backend (Highlight/Axiom/Honeycomb)

  logger.info('OpenTelemetry stub initialized (no export target configured)');
}
