// Admin capabilities. All gated by `requiresAdmin: true` in their definition;
// the registry rejects non-admin RequestContexts before the handler runs.
//
// New admin capabilities go here. Naming convention: `admin.<resource><Action>`
// (e.g., admin.listRules, admin.updateRule, admin.getCosts).

export { getDashboardStats } from './getDashboardStats.js';
export { listRules } from './listRules.js';
export { createRule } from './createRule.js';
export { updateRule } from './updateRule.js';
export { deleteRule } from './deleteRule.js';
export { listExamples } from './listExamples.js';
export { createExample } from './createExample.js';
export { updateExample } from './updateExample.js';
export { deleteExample } from './deleteExample.js';
export { listPrompts } from './listPrompts.js';
export { getPromptHistory } from './getPromptHistory.js';
export { createPromptVersion } from './createPromptVersion.js';
export { rollbackPrompt } from './rollbackPrompt.js';
