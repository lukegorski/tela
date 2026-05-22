/**
 * Full wardrobe for one user (rich item shape with signed image URLs).
 * Mirrors admin.getUserWardrobe capability — keep return shapes aligned.
 * If schema changes, BOTH sites need updating.
 *
 * Wraps the same `fetchRichItems` used by `wardrobe.listItems` so signed
 * URL caching and the closet/photo joins stay consistent.
 */
import 'server-only';
import { fetchRichItems, type RichItem } from '@tela/capabilities';

export async function getUserWardrobe(userId: string): Promise<RichItem[]> {
  return fetchRichItems({ userId });
}

export type { RichItem };
