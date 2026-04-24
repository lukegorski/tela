import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const preferencesSchema = z.object({
  styleKeywords: z.array(z.string()),
  favoriteColors: z.array(z.string()),
  avoidColors: z.array(z.string()),
  formality: z.string(),
  lifestyle: z.string(),
});

const bodyInfoSchema = z.object({
  bodyType: z.string(),
  height: z.string(),
  fitPreference: z.string(),
});

const input = z.object({
  preferences: preferencesSchema,
  bodyInfo: bodyInfoSchema,
});

const output = z.object({
  userId: z.string().uuid(),
  onboardingComplete: z.literal(true),
});

/**
 * Mark onboarding complete and persist the user's style preferences + body info.
 * Idempotent — safe to re-run; replaces previous values.
 */
export const completeOnboarding = registerCapability({
  name: 'user.completeOnboarding',
  description:
    "Persist the user's onboarding answers (style preferences + body info) and flip onboarding_complete. Returns the canonical userId.",
  input,
  output,

  async execute({ preferences, bodyInfo }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    await db
      .update(users)
      .set({
        preferences,
        bodyInfo,
        onboardingComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await logEvent({
      userId,
      type: 'profile.updated',
      source,
      payload: { reason: 'onboarding_complete' },
    });

    return { userId, onboardingComplete: true as const };
  },
});
