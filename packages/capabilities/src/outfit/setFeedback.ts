import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, outfits } from '@tela/db';
import { logEvent, type EventType } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { fetchRichOutfits, richOutfitSchema } from './outfitShape.js';

const feedbackSchema = z.enum(['up', 'down']).nullable();

const input = z.object({
  outfitId: z.string().uuid(),
  feedback: feedbackSchema,
});

const output = richOutfitSchema;

export const setFeedback = registerCapability({
  name: 'outfit.setFeedback',
  chatTool: true,
  description:
    "Record the user's thumbs-up / thumbs-down feedback on an outfit, or pass null to clear it. Idempotent.",
  input,
  output,

  async execute({ outfitId, feedback }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    const [updated] = await db
      .update(outfits)
      .set({ feedback })
      .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
      .returning({ id: outfits.id });

    if (!updated) throw new Error('Outfit not found');

    const eventType: EventType =
      feedback === 'up'
        ? 'feedback.positive'
        : feedback === 'down'
          ? 'feedback.negative'
          : 'feedback.cleared';

    await logEvent({
      userId,
      type: eventType,
      source,
      payload: { outfitId, feedback },
    });

    const [rich] = await fetchRichOutfits({ userId, outfitId });
    if (!rich) throw new Error('Outfit disappeared after feedback');
    return rich;
  },
});
