// Admin capabilities. All gated by `requiresAdmin: true` in their definition;
// the registry rejects non-admin RequestContexts before the handler runs.
//
// New admin capabilities go here. Naming convention: `admin.<resource><Action>`
// (e.g., admin.listRules, admin.updateRule, admin.getCosts).

export { getDashboardStats } from './getDashboardStats.js';
