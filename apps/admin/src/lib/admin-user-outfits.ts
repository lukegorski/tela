/**
 * Full outfit list for one user (rich shape with joined items, latest try-on,
 * and signed image URLs). Mirrors admin.getUserOutfits capability —
 * keep return shapes aligned. If schema changes, BOTH sites need updating.
 *
 * Wraps the same `fetchRichOutfits` used by `outfit.list` so signed URL
 * caching, the items/try-on joins, and ordering stay consistent.
 */
import 'server-only';
import { fetchRichOutfits, type RichOutfit } from '@tela/capabilities';

export async function getUserOutfits(userId: string): Promise<RichOutfit[]> {
  return fetchRichOutfits({ userId, orderBy: 'createdAt' });
}

export type { RichOutfit };
