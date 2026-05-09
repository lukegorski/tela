export { migrateLegacyUser, resolveIdsByEmail } from './migrateLegacyUser.js';
export type { MigrateOptions, MigrateResult, MigratePreview } from './types.js';
export {
  preCreateUser,
  enumerateLegacyUsers,
  applyEmailFilters,
} from './preCreate.js';
export type {
  LegacyUserRecord,
  PreCreateResult,
  PreCreateAction,
  PreCreateOptions,
} from './preCreate.js';
