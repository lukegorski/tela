// ─── Event Type Taxonomy ───
// All event types are defined here as a union type.
// logEvent() requires a known EventType — TypeScript catches typos.
// Naming convention: domain.action_in_past_tense
// Annotations: (always) = must be logged, (selective) = log for user-initiated reads only

// Wardrobe domain
type WardrobeEvent =
  | 'wardrobe.item_added'
  | 'wardrobe.item_removed'
  | 'wardrobe.item_updated'
  | 'wardrobe.item_worn'
  | 'wardrobe.item_viewed' // selective
  | 'wardrobe.closet_viewed' // selective
  | 'wardrobe.photo_uploaded';

// Profile domain
type ProfileEvent =
  | 'profile.closet_read_started'
  | 'profile.closet_read_completed'
  | 'profile.updated'
  | 'profile.viewed' // selective
  | 'profile.dimensions_derived';

// Outfit domain
type OutfitEvent =
  | 'outfit.generated'
  | 'outfit.regenerated'
  | 'outfit.viewed' // selective
  | 'outfit.saved'
  | 'outfit.unsaved' // saved → false; row still exists (vs outfit.deleted = row destroyed)
  | 'outfit.deleted'
  | 'outfit.role_duplicate_dropped' // AI emitted duplicate role; insertion dedup dropped extras pre-insert
  | 'outfit.role_corrected' // AI role contradicted closet category; category won at insert (P3 root-cause fix)
  | 'outfit.worn_confirmed'
  | 'outfit.worn_inferred';

// Context domain
type ContextEvent = 'context.assembled' | 'context.occasion_updated';

// Feedback domain (deferred)
type FeedbackEvent =
  | 'feedback.positive'
  | 'feedback.negative'
  | 'feedback.cleared'
  | 'feedback.implicit_signal';

// AI domain (cross-cutting, logged by AI gateway)
type AIEvent = 'ai.generation_completed' | 'ai.generation_failed';

// Chat domain (deferred)
type ChatEvent =
  | 'chat.message_sent'
  | 'chat.message_received'
  | 'chat.tool_invoked'
  | 'chat.conversation_started'
  | 'chat.conversation_summarized';

// Admin chat domain (Phase 14c — cofounder/admin AI assistant surface)
// Mirrors ChatEvent for the admin surface; namespaced separately so the
// activity feed and per-user dashboards don't conflate user-chat volume
// with admin-chat volume.
type AdminChatEvent =
  | 'admin.chat.conversation_started'
  | 'admin.chat.message_sent'
  | 'admin.chat.message_received'
  | 'admin.chat.tool_invoked';

// Enhancement domain (deferred)
type EnhancementEvent =
  | 'enhancement.started'
  | 'enhancement.completed'
  | 'enhancement.retry'
  | 'enhancement.failed'
  | 'enhancement.cutout_completed' // transparent WebP cutout written (builder v0)
  | 'enhancement.cutout_failed'; // cutout error — never affects enhancement itself (fail-open)

// Try-on domain
type TryOnEvent =
  | 'tryon.started'
  | 'tryon.step_completed'
  | 'tryon.completed'
  | 'tryon.failed'
  // A prompt-guided step produced a zoomed/cropped frame and was re-run
  // with a random seed (see capabilities/src/tryon/framingCheck.ts).
  | 'tryon.framing_retry';

// Auth domain
type AuthEvent = 'auth.signed_up' | 'auth.signed_in' | 'auth.onboarding_completed';

export type EventType =
  | WardrobeEvent
  | ProfileEvent
  | OutfitEvent
  | ContextEvent
  | FeedbackEvent
  | AIEvent
  | ChatEvent
  | AdminChatEvent
  | EnhancementEvent
  | TryOnEvent
  | AuthEvent;
