import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, closetItems, outfitDrafts } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

/**
 * The single active builder draft (spec §3, decision #6): slot → closetItemId
 * plus dress state. Restore is verbatim; deleted item ids are skipped
 * client-side (the builder empties that slot with a subtle note).
 * Concurrent devices: last-write-wins, no merge — documented behavior.
 */
const slotsSchema = z.object({
  outerwear: z.string().uuid().nullable().default(null),
  top: z.string().uuid().nullable().default(null),
  bottom: z.string().uuid().nullable().default(null),
  shoes: z.string().uuid().nullable().default(null),
  dress: z.string().uuid().nullable().default(null),
  dressActive: z.boolean().default(false),
});

export const saveDraft = registerCapability({
  name: 'outfit.saveDraft',
  description:
    "Upsert the caller's single active builder draft (slot → item ids + dress state). Last write wins.",
  input: z.object({ slots: slotsSchema }),
  output: z.object({ updatedAt: z.string() }),

  async execute({ slots }) {
    const { userId } = getRequestContext();
    const db = getDb();

    // Ownership: every referenced item must belong to the caller.
    const ids = [slots.outerwear, slots.top, slots.bottom, slots.shoes, slots.dress].filter(
      (v): v is string => v !== null,
    );
    if (ids.length > 0) {
      const owned = await db
        .select({ id: closetItems.id })
        .from(closetItems)
        .where(and(eq(closetItems.userId, userId), inArray(closetItems.id, ids)));
      if (owned.length !== new Set(ids).size) {
        throw new Error('Draft references items that do not belong to the user');
      }
    }

    const now = new Date();
    await db
      .insert(outfitDrafts)
      .values({ userId, slots, updatedAt: now })
      .onConflictDoUpdate({
        target: outfitDrafts.userId,
        set: { slots, updatedAt: now },
      });

    return { updatedAt: now.toISOString() };
  },
});

export const getDraft = registerCapability({
  name: 'outfit.getDraft',
  description: "Read the caller's single active builder draft, or null if none exists.",
  input: z.object({}),
  output: z.object({
    slots: slotsSchema.nullable(),
    updatedAt: z.string().nullable(),
  }),

  async execute() {
    const { userId } = getRequestContext();
    const db = getDb();
    const draft = await db.query.outfitDrafts.findFirst({
      where: eq(outfitDrafts.userId, userId),
    });
    if (!draft) return { slots: null, updatedAt: null };
    const parsed = slotsSchema.safeParse(draft.slots);
    return {
      slots: parsed.success ? parsed.data : null,
      updatedAt: draft.updatedAt.toISOString(),
    };
  },
});
