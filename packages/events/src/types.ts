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

// Enhancement domain (deferred)
type EnhancementEvent =
  | 'enhancement.started'
  | 'enhancement.completed'
  | 'enhancement.retry'
  | 'enhancement.failed';

// Try-on domain (deferred)
type TryOnEvent = 'tryon.started' | 'tryon.step_completed' | 'tryon.completed' | 'tryon.failed';

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
  | EnhancementEvent
  | TryOnEvent
  | AuthEvent;
