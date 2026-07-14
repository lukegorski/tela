import { z } from 'zod';
import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, closetItems, outfits, outfitItems } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, TRY_ON_BUCKET } from '../storage/supabase.js';
import { fetchRichOutfits, richOutfitSchema } from './outfitShape.js';

const slotIds = z.object({
  top: z.string().uuid().nullable().default(null),
  bottom: z.string().uuid().nullable().default(null),
  outerwear: z.string().uuid().nullable().default(null),
  shoes: z.string().uuid().nullable().default(null),
  dress: z.string().uuid().nullable().default(null),
});
type SlotIds = z.infer<typeof slotIds>;

const MAX_CARD_BYTES = 1_000_000;

const input = z.object({
  slots: slotIds,
  name: z.string().min(1).max(120).optional(),
  /** Client-exported composition snapshot, base64 without data: prefix. */
  cardImageBase64: z.string().max(1_400_000).optional(),
  /** Actual encoding of the snapshot (Safari can't produce webp). */
  cardImageMime: z.enum(['image/webp', 'image/png', 'image/jpeg']).default('image/webp'),
});

const output = z.object({
  outfit: richOutfitSchema,
});

/**
 * Validity per spec §3: (top AND bottom) OR dress. Pure — unit-tested.
 * Returns the role→itemId entries to persist (dress wins over top/bottom,
 * mirroring the pipeline's dress-wins semantics).
 */
export function manualComposition(slots: SlotIds):
  | { ok: true; entries: Array<{ role: string; closetItemId: string }> }
  | { ok: false; reason: string } {
  const entries: Array<{ role: string; closetItemId: string }> = [];
  if (slots.dress) {
    entries.push({ role: 'dress', closetItemId: slots.dress });
  } else if (slots.top && slots.bottom) {
    entries.push({ role: 'top', closetItemId: slots.top });
    entries.push({ role: 'bottom', closetItemId: slots.bottom });
  } else {
    return { ok: false, reason: 'An outfit needs a top and a bottom, or a dress' };
  }
  if (slots.outerwear) entries.push({ role: 'outerwear', closetItemId: slots.outerwear });
  if (slots.shoes) entries.push({ role: 'shoes', closetItemId: slots.shoes });

  const ids = entries.map((e) => e.closetItemId);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: 'The same item cannot fill two slots' };
  }
  return { ok: true, entries };
}

/**
 * Save a manually-built outfit (spec §3 Save). Category is ground truth:
 * each referenced item's closet category must match its slot. The card
 * snapshot (if provided) is stored for future card rendering — the current
 * outfits page renders manual outfits through the same item-grid mechanism
 * as AI outfits, untouched.
 */
export const createManual = registerCapability({
  name: 'outfit.createManual',
  description:
    'Save a manually-composed outfit from the builder: validates the slot composition ((top AND bottom) OR dress; optional outerwear/shoes), verifies ownership and category-role match, stores the optional card snapshot, and returns the rich outfit.',
  input,
  output,

  async execute({ slots, name, cardImageBase64, cardImageMime }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    const composition = manualComposition(slots);
    if (!composition.ok) throw new Error(composition.reason);
    const { entries } = composition;

    // Ownership + category-role match (category is ground truth — P3 lesson).
    const ids = entries.map((e) => e.closetItemId);
    const owned = await db
      .select({ id: closetItems.id, category: closetItems.category })
      .from(closetItems)
      .where(and(eq(closetItems.userId, userId), inArray(closetItems.id, ids)));
    const categoryById = new Map(owned.map((o) => [o.id, o.category]));
    for (const entry of entries) {
      const category = categoryById.get(entry.closetItemId);
      if (!category) throw new Error('Outfit references an item that does not belong to the user');
      if (category !== entry.role) {
        throw new Error(`Item category '${category}' cannot fill the '${entry.role}' slot`);
      }
    }

    const pairingKey = createHash('sha256')
      .update(ids.slice().sort().join('|'))
      .digest('hex')
      .slice(0, 32);

    const [outfit] = await db
      .insert(outfits)
      .values({
        userId,
        source: 'manual',
        name: name ?? null,
        pairingKey,
        saved: true,
        savedAt: new Date(),
      })
      .returning({ id: outfits.id });

    await db.insert(outfitItems).values(
      entries.map((e) => ({
        outfitId: outfit.id,
        closetItemId: e.closetItemId,
        role: e.role,
      })),
    );

    // Card snapshot — best-effort: a card failure never loses the outfit.
    let cardStored = false;
    if (cardImageBase64) {
      try {
        const buf = Buffer.from(cardImageBase64, 'base64');
        if (buf.length === 0 || buf.length > MAX_CARD_BYTES) {
          throw new Error(`card image size out of bounds (${buf.length} bytes)`);
        }
        const ext = cardImageMime === 'image/png' ? 'png' : cardImageMime === 'image/jpeg' ? 'jpg' : 'webp';
        const cardPath = `cards/${userId}/${outfit.id}.${ext}`;
        const supabase = getSupabaseAdmin();
        const { error: uploadErr } = await supabase.storage
          .from(TRY_ON_BUCKET)
          .upload(cardPath, buf, { contentType: cardImageMime, upsert: true });
        if (uploadErr) throw new Error(uploadErr.message);
        await db.update(outfits).set({ cardStoragePath: cardPath }).where(eq(outfits.id, outfit.id));
        cardStored = true;
      } catch {
        cardStored = false;
      }
    }

    await logEvent({
      userId,
      type: 'outfit.manual_saved',
      source,
      payload: {
        outfitId: outfit.id,
        composition: entries.map((e) => e.role),
        had_shoes: !!slots.shoes,
        dress_mode: !!slots.dress,
        cardStored,
      },
    });

    const [rich] = await fetchRichOutfits({ userId, outfitId: outfit.id });
    if (!rich) throw new Error('Saved outfit could not be re-read');
    return { outfit: rich };
  },
});
