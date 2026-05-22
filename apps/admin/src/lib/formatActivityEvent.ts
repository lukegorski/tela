/**
 * Render an event row as the human-readable label shown on the activity
 * feed (e.g. "uploaded a top", "generated 3 outfits for work"). The payload
 * is required for events that carry useful detail in their payload (count,
 * occasion, category, feedback direction, etc.).
 *
 * Ported from legacy admin's ACTION_LABELS (admin/activity/page.tsx:19) —
 * keys remapped from legacy taxonomy (item_uploaded, profile_created, etc.)
 * to our event taxonomy (wardrobe.item_added, auth.signed_up, etc.).
 *
 * Unknown event types fall back to the raw type. Missing payload fields
 * fall back to generic labels.
 */

type Payload = Record<string, unknown> | null | undefined;

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export function formatActivityEvent(eventType: string, payload: Payload): string {
  switch (eventType) {
    case 'wardrobe.item_added':
      return `uploaded a ${asString(payload?.category) ?? 'item'}`;
    case 'wardrobe.item_removed':
      return `deleted a ${asString(payload?.category) ?? 'item'}`;
    case 'wardrobe.item_updated':
      return `updated a ${asString(payload?.category) ?? 'item'}`;
    case 'wardrobe.item_worn':
      return 'marked an item worn';
    case 'wardrobe.photo_uploaded':
      return 'uploaded a photo';

    case 'outfit.generated': {
      const count = asNumber(payload?.count);
      const occasion = asString(payload?.occasion);
      if (count != null && occasion) return `generated ${count} outfits for ${occasion}`;
      if (count != null) return `generated ${count} outfits`;
      if (occasion) return `generated outfits for ${occasion}`;
      return 'generated outfits';
    }
    case 'outfit.regenerated':
      return 'regenerated outfits';
    case 'outfit.saved':
      return 'saved an outfit';
    case 'outfit.unsaved':
      return 'unsaved an outfit';
    case 'outfit.deleted':
      return 'deleted an outfit';
    case 'outfit.worn_confirmed':
      return 'confirmed wearing an outfit';
    case 'outfit.worn_inferred':
      return 'wore an outfit (inferred)';

    case 'feedback.positive':
      return 'gave thumbs up feedback';
    case 'feedback.negative':
      return 'gave thumbs down feedback';
    case 'feedback.cleared':
      return 'cleared feedback';

    case 'tryon.started':
      return 'requested a try-on';
    case 'tryon.completed':
      return 'completed a try-on';
    case 'tryon.failed':
      return 'try-on failed';

    case 'auth.signed_up':
      return 'signed up';
    case 'auth.signed_in':
      return 'signed in';
    case 'auth.onboarding_completed':
      return 'completed onboarding';

    case 'chat.message_sent':
      return 'sent a chat message';
    case 'chat.conversation_started':
      return 'started a chat conversation';

    case 'profile.closet_read_started':
      return 'started a closet read';
    case 'profile.closet_read_completed':
      return 'finished a closet read';
    case 'profile.updated':
      return 'updated their profile';

    default:
      return eventType;
  }
}
