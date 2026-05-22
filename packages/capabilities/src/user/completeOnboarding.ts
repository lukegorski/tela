import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, users, wardrobeGaps } from '@tela/db';
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
  /**
   * Free-form wardrobe gaps the user identified during onboarding (one per
   * line in the legacy textarea, e.g. "white sneakers", "structured
   * blazer"). Each becomes a row in `wardrobe_gaps` so downstream
   * features can mark resolved, surface in chat, etc. Optional —
   * onboarding works without it.
   */
  wardrobeGaps: z.array(z.string().min(1)).default([]),
});

const output = z.object({
  userId: z.string().uuid(),
  onboardingComplete: z.literal(true),
  /** Number of wardrobe_gaps rows we wrote. */
  wardrobeGapsWritten: z.number().int(),
});

/**
 * Mark onboarding complete and persist the user's style preferences + body
 * info + wardrobe gaps. Idempotent on the user fields (replaces previous
 * values); for wardrobe gaps, replaces the *unresolved* set (any
 * still-unresolved rows are deleted, then the new list is inserted).
 *
 * Storage decision (visual port reconciliation): wardrobe gaps live in
 * the `wardrobe_gaps` table, not as a JSONB string[] on users. Same
 * caller-facing shape, structured storage. See visual-port plan for
 * rationale.
 */
export const completeOnboarding = registerCapability({
  name: 'user.completeOnboarding',
  description:
    "Persist the user's onboarding answers (preferences, body info, wardrobe gaps) and flip onboarding_complete. Wardrobe gaps are written as rows into wardrobe_gaps; each call replaces the user's currently-unresolved set.",
  input,
  output,

  async execute({ preferences, bodyInfo, wardrobeGaps: gapsList }) {
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

    // Replace the user's currently-unresolved wardrobe gaps. We don't
    // touch resolved ones — those are history.
    await db
      .delete(wardrobeGaps)
      .where(eq(wardrobeGaps.userId, userId));

    let wardrobeGapsWritten = 0;
    if (gapsList.length > 0) {
      const rows = gapsList
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((description) => ({
          userId,
          // Free-form text — the legacy textarea didn't categorize, so we
          // leave category empty and let downstream code (e.g., chat
          // suggestions) fill it in if useful.
          category: '',
          description,
          priority: 0,
        }));
      if (rows.length > 0) {
        await db.insert(wardrobeGaps).values(rows);
        wardrobeGapsWritten = rows.length;
      }
    }

    await logEvent({
      userId,
      type: 'auth.onboarding_completed',
      source,
      payload: { wardrobeGapsWritten },
    });

    return {
      userId,
      onboardingComplete: true as const,
      wardrobeGapsWritten,
    };
  },
});
