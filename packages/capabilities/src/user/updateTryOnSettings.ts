import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, users, type UserTryOnSettings } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const tryOnSettingsSchema = z.object({
  background: z.enum(['neutral', 'chic-interior', 'nighttime']),
  model: z.enum(['self', 'model-woman', 'model-man']),
  selfPhotoURL: z.string().nullable(),
});

const input = tryOnSettingsSchema;

const output = z.object({
  userId: z.string().uuid(),
});

/**
 * Update the user's try-on rendering preferences. Idempotent — replaces
 * the full settings object. Used by the legacy try-on settings UI port.
 *
 * Field semantics match the legacy `TryOnSettings` interface so the UI
 * can map 1:1 (the database column shape is the legacy shape).
 */
export const updateTryOnSettings = registerCapability({
  name: 'user.updateTryOnSettings',
  description:
    "Update the user's try-on rendering preferences (background, model choice, optional self-photo URL). Replaces the full settings object.",
  input,
  output,

  async execute(settings) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    const value: UserTryOnSettings = {
      background: settings.background,
      model: settings.model,
      selfPhotoURL: settings.selfPhotoURL,
    };

    await db
      .update(users)
      .set({
        tryOnSettings: value,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await logEvent({
      userId,
      type: 'profile.updated',
      source,
      payload: { reason: 'try_on_settings_updated' },
    });

    return { userId };
  },
});
