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
export { getCosts } from './getCosts.js';
export { listUsers } from './listUsers.js';
export { getUserDetail } from './getUserDetail.js';
export { getActivity } from './getActivity.js';
export { getUserCostsReport } from './getUserCostsReport.js';
export { getUserWardrobe } from './getUserWardrobe.js';
export { getUserOutfits } from './getUserOutfits.js';
export { getChatOverview } from './getChatOverview.js';
export { getConversation } from './getConversation.js';
export { getUserConversations } from './getUserConversations.js';
export { listAdminChats } from './listAdminChats.js';
export { streamAdminChat, type StreamAdminChatInput } from './streamAdminChat.js';
