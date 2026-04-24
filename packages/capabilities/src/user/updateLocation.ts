import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  city: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(64),
  tempUnit: z.enum(['C', 'F']).default('C'),
});

const output = z.object({
  userId: z.string().uuid(),
  saved: z.literal(true),
});

/**
 * Update the user's saved location (city + lat/lon + timezone). Used by
 * context.assemble for weather lookups and by outfit prompts for season
 * determination.
 */
export const updateLocation = registerCapability({
  name: 'user.updateLocation',
  description:
    "Update the user's saved location. Stores city, country, lat/lon, timezone, and preferred temperature unit. Used by context.assemble for weather + season inference.",
  input,
  output,

  async execute(location) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    await db
      .update(users)
      .set({ location, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await logEvent({
      userId,
      type: 'profile.updated',
      source,
      payload: { reason: 'location_updated', city: location.city },
    });

    return { userId, saved: true as const };
  },
});
