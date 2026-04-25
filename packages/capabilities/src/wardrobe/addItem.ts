import { z } from 'zod';
import { getDb, closetItems, closets, itemPhotos } from '@tela/db';
import { logEvent } from '@tela/events';
import { eq, sql } from 'drizzle-orm';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  photoId: z.string().uuid(),
  metadata: z.object({
    category: z.string().min(1),
    subcategory: z.string().nullable().default(null),
    primaryColor: z.string().min(1),
    secondaryColor: z.string().nullable().default(null),
    pattern: z.string().nullable().default(null),
    style: z.string().nullable().default(null),
    fit: z.string().nullable().default(null),
    length: z.string().nullable().default(null),
    sleeveLength: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    formalityScore: z.number().min(0).max(1).default(0.5),
    materialWeight: z.enum(['light', 'medium', 'heavy']).default('medium'),
    material: z.string().nullable().default(null),
    seasonCompatibility: z.array(z.enum(['spring', 'summer', 'fall', 'winter'])).default([]),
    analysisLocale: z.string().default('en'),
  }),
});

const output = z.object({
  itemId: z.string().uuid(),
  closetId: z.string().uuid(),
});

export const addItem = registerCapability({
  name: 'wardrobe.addItem',
  description:
    "Add a clothing item to a user's closet with AI-extracted metadata. Requires a photo reference and classification metadata.",
  input,
  output,

  async execute({ photoId, metadata }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // Verify the photo exists and belongs to this user
    const photo = await db.query.itemPhotos.findFirst({
      where: (photos, { and, eq: e }) => and(e(photos.id, photoId), e(photos.userId, userId)),
    });
    if (!photo) {
      throw new Error('Photo not found or does not belong to user');
    }

    // Get or create the user's closet
    let closet = await db.query.closets.findFirst({
      where: eq(closets.userId, userId),
    });
    if (!closet) {
      const [created] = await db
        .insert(closets)
        .values({ userId })
        .returning();
      closet = created;
    }

    // Insert the closet item
    const [item] = await db
      .insert(closetItems)
      .values({
        closetId: closet.id,
        userId,
        photoId,
        category: metadata.category,
        subcategory: metadata.subcategory,
        primaryColor: metadata.primaryColor,
        secondaryColor: metadata.secondaryColor,
        pattern: metadata.pattern,
        style: metadata.style,
        fit: metadata.fit,
        length: metadata.length,
        sleeveLength: metadata.sleeveLength,
        description: metadata.description,
        formalityScore: metadata.formalityScore,
        materialWeight: metadata.materialWeight,
        material: metadata.material,
        seasonCompatibility: metadata.seasonCompatibility,
        analysisLocale: metadata.analysisLocale,
      })
      .returning({ id: closetItems.id });

    // Update closet aggregate
    await db
      .update(closets)
      .set({
        itemCount: sql`${closets.itemCount} + 1`,
        lastUpdatedAt: new Date(),
      })
      .where(eq(closets.id, closet.id));

    // Log event
    await logEvent({
      userId,
      type: 'wardrobe.item_added',
      source,
      payload: {
        itemId: item.id,
        category: metadata.category,
        primaryColor: metadata.primaryColor,
      },
    });

    return {
      itemId: item.id,
      closetId: closet.id,
    };
  },
});
