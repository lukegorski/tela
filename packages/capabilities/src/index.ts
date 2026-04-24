// Import all capability modules to trigger registration
import './auth/index.js';
import './user/index.js';
import './wardrobe/index.js';
import './item/index.js';
import './profile/index.js';
import './context/index.js';
import './outfit/index.js';
import './enhancement/index.js';
import './chat/index.js';

// Re-export registry functions
export {
  getCapability,
  getAllCapabilities,
  executeCapability,
  registerCapability,
} from './registry.js';

// Re-export types
export type { Capability, RegisteredCapability } from './types.js';

// Re-export request context for entry points (tRPC, MCP, workers, scripts)
export {
  runInContext,
  getRequestContext,
  tryGetRequestContext,
  type RequestContext,
  type CallSource,
} from './context/requestContext.js';

// Re-export observability hooks for apps to register their own loggers / Sentry / OTel
export {
  setObservabilityHooks,
  type ObservabilityHooks,
  type CapabilityExecutionEvent,
  type CapabilityCompletedEvent,
  type CapabilityErrorEvent,
} from './observability.js';
