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
import './admin/index.js';
import './tryon/index.js';

// Re-export registry functions
export {
  getCapability,
  getAllCapabilities,
  executeCapability,
  registerCapability,
  AdminRequiredError,
} from './registry.js';

// Re-export streaming chat helpers (used by the SSE endpoint, not via tRPC)
export {
  streamChatTurn,
  type ChatStreamEvent,
  type StreamChatInput,
} from './chat/index.js';

// Re-export admin streaming chat helper (Phase 14c) for the /admin/chat/stream endpoint
export {
  streamAdminChat,
  type StreamAdminChatInput,
} from './admin/index.js';

// Re-export types
export type { Capability, RegisteredCapability } from './types.js';

// Re-export shared rich-shape fetchers + schemas for callers (e.g. admin RSC
// lib helpers) that need them outside the capability-call path.
export { fetchRichItems, richItemSchema, type RichItem } from './wardrobe/itemShape.js';
export {
  fetchRichOutfits,
  richOutfitSchema,
  type RichOutfit,
} from './outfit/outfitShape.js';

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
