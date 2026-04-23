import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, itemPhotos } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  photoId: z.string().uuid(),
});

const output = z.object({
  photoId: z.string().uuid(),
  resetTo: z.literal('pending'),
});

/**
 * Manually reset a failed (or completed-but-want-to-redo) enhancement back to
 * 'pending' so it gets re-picked-up by the worker. Useful when fixing a prompt
 * or retrying after transient failures.
 */
export const retryEnhancement = registerCapability({
  name: 'enhancement.retry',
  description:
    "Reset a photo's enhancement status to 'pending' so the worker re-processes it. Useful for failed enhancements or after prompt updates. The actual processing is enqueued by the caller (typically the API or admin tool).",
  input,
  output,

  async execute({ photoId }) {
    const { userId } = getRequestContext();
    const db = getDb();

    const photo = await db.query.itemPhotos.findFirst({
      where: and(eq(itemPhotos.id, photoId), eq(itemPhotos.userId, userId)),
    });
    if (!photo) {
      throw new Error('Photo not found or does not belong to user');
    }

    await db
      .update(itemPhotos)
      .set({
        enhancementStatus: 'pending',
        enhancementError: null,
      })
      .where(eq(itemPhotos.id, photoId));

    return { photoId, resetTo: 'pending' as const };
  },
});
