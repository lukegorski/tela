import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { getDb, closetItems } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  category: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const itemSummary = z.object({
  id: z.string().uuid(),
  photoId: z.string().uuid(),
  enhancedPhotoId: z.string().uuid().nullable(),
  category: z.string(),
  subcategory: z.string().nullable(),
  primaryColor: z.string(),
  description: z.string().nullable(),
  wearCount: z.number(),
  createdAt: z.string(),
});

const output = z.object({
  items: z.array(itemSummary),
  total: z.number(),
});

/**
 * List items in a user's closet with optional category filter and pagination.
 */
export const listItems = registerCapability({
  name: 'wardrobe.listItems',
  chatTool: true,
  description: "List items in a user's closet. Supports filtering by category and pagination via limit/offset. Returns lightweight summaries — use wardrobe.getItem for full detail.",
  input,
  output,

  async execute({ category, limit, offset }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    const whereClause = category
      ? and(eq(closetItems.userId, userId), eq(closetItems.category, category))
      : eq(closetItems.userId, userId);

    const items = await db
      .select({
        id: closetItems.id,
        photoId: closetItems.photoId,
        enhancedPhotoId: closetItems.enhancedPhotoId,
        category: closetItems.category,
        subcategory: closetItems.subcategory,
        primaryColor: closetItems.primaryColor,
        description: closetItems.description,
        wearCount: closetItems.wearCount,
        createdAt: closetItems.createdAt,
      })
      .from(closetItems)
      .where(whereClause)
      .orderBy(desc(closetItems.createdAt))
      .limit(limit)
      .offset(offset);

    // User-initiated browse — log per the scoped logging rule
    await logEvent({
      userId,
      type: 'wardrobe.closet_viewed',
      source,
      payload: { category, limit, offset, returned: items.length },
    });

    return {
      items: items.map((i) => ({
        id: i.id,
        photoId: i.photoId,
        enhancedPhotoId: i.enhancedPhotoId,
        category: i.category,
        subcategory: i.subcategory,
        primaryColor: i.primaryColor,
        description: i.description,
        wearCount: i.wearCount,
        createdAt: i.createdAt.toISOString(),
      })),
      total: items.length,
    };
  },
});
