import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb, closetItems } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  itemId: z.string().uuid(),
});

const output = z.object({
  id: z.string().uuid(),
  closetId: z.string().uuid(),
  photoId: z.string().uuid(),
  enhancedPhotoId: z.string().uuid().nullable(),
  category: z.string(),
  subcategory: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string().nullable(),
  pattern: z.string().nullable(),
  style: z.string().nullable(),
  fit: z.string().nullable(),
  length: z.string().nullable(),
  sleeveLength: z.string().nullable(),
  description: z.string().nullable(),
  formalityScore: z.number(),
  materialWeight: z.string(),
  seasonCompatibility: z.array(z.string()),
  wearCount: z.number(),
  lastWornAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Get a single closet item by ID, scoped to the requesting user.
 */
export const getItem = registerCapability({
  name: 'wardrobe.getItem',
  description: "Fetch a single closet item by ID. Returns null if the item doesn't belong to the user.",
  input,
  output,

  async execute({ itemId }) {
    const { userId, source } = getRequestContext();
    const db = getDb();
    const item = await db.query.closetItems.findFirst({
      where: and(eq(closetItems.id, itemId), eq(closetItems.userId, userId)),
    });

    if (!item) {
      throw new Error('Item not found');
    }

    // User-initiated read — log per the scoped logging rule
    await logEvent({
      userId,
      type: 'wardrobe.item_viewed',
      source,
      payload: { itemId },
    });

    return {
      id: item.id,
      closetId: item.closetId,
      photoId: item.photoId,
      enhancedPhotoId: item.enhancedPhotoId,
      category: item.category,
      subcategory: item.subcategory,
      primaryColor: item.primaryColor,
      secondaryColor: item.secondaryColor,
      pattern: item.pattern,
      style: item.style,
      fit: item.fit,
      length: item.length,
      sleeveLength: item.sleeveLength,
      description: item.description,
      formalityScore: item.formalityScore,
      materialWeight: item.materialWeight,
      seasonCompatibility: item.seasonCompatibility as string[],
      wearCount: item.wearCount,
      lastWornAt: item.lastWornAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  },
});
