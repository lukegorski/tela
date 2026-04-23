// Import all capability modules to trigger registration
import './wardrobe/index.js';
import './item/index.js';

// Re-export registry functions
export {
  getCapability,
  getAllCapabilities,
  executeCapability,
  registerCapability,
} from './registry.js';

// Re-export types
export type { Capability, RegisteredCapability } from './types.js';
