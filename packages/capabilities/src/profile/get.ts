import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, styleProfiles } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';

const dimensionsSchema = z.object({
  minimalMaximal: z.number(),
  classicTrendy: z.number(),
  casualFormal: z.number(),
  subtleBold: z.number(),
  structuredFluid: z.number(),
});

const input = z.object({
  userId: z.string().uuid(),
});

const output = z.object({
  profileId: z.string().uuid(),
  profileText: z.string(),
  dimensions: dimensionsSchema,
  confidence: dimensionsSchema,
  signals: z.array(
    z.object({
      tag: z.string(),
      strength: z.number(),
      source: z.string(),
    }),
  ),
  latestVersionId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Fetch the user's current style profile.
 * Throws if no profile exists — call profile.closetRead first.
 */
export const getProfile = registerCapability({
  name: 'profile.get',
  description:
    "Fetch the user's current style profile, including the prose closet read, 5-axis numerical dimensions, and learned signals.",
  input,
  output,

  async execute({ userId }) {
    const db = getDb();
    const profile = await db.query.styleProfiles.findFirst({
      where: eq(styleProfiles.userId, userId),
    });

    if (!profile) {
      throw new Error('No style profile exists for this user. Run profile.closetRead first.');
    }

    // User-initiated read — log per the scoped logging rule
    await logEvent({
      userId,
      type: 'profile.viewed',
      source: 'api',
      payload: { profileId: profile.id },
    });

    return {
      profileId: profile.id,
      profileText: profile.profileText,
      dimensions: profile.dimensions,
      confidence: profile.confidence,
      signals: profile.signals,
      latestVersionId: profile.latestVersionId,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  },
});
