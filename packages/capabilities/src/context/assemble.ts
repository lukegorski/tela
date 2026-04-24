import { z } from 'zod';
import { getDb, contexts } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from './requestContext.js';
import { fetchWeather } from './weather.js';

const weatherSchema = z.object({
  temperatureCelsius: z.number(),
  condition: z.string(),
  humidity: z.number(),
  windSpeedKph: z.number(),
  location: z.string(),
});

const occasionSchema = z.enum([
  'everyday',
  'work',
  'date_night',
  'formal',
  'weekend',
  'active',
  'travel',
]);

const input = z.object({
  occasion: occasionSchema.default('everyday'),
  // Either pass weather directly or pass coords for OpenWeatherMap lookup
  weather: weatherSchema.optional(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    })
    .optional(),
  // ISO 8601 timestamp; defaults to now
  now: z.string().datetime().optional(),
  // Optional free-form calendar context (e.g. "Lunch with investor")
  calendarContext: z.string().nullable().default(null),
});

const output = z.object({
  contextId: z.string().uuid(),
  weather: weatherSchema.nullable(),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']),
  season: z.enum(['spring', 'summer', 'fall', 'winter']),
  occasion: occasionSchema,
  calendarContext: z.string().nullable(),
});

/**
 * Assemble a context snapshot for outfit generation.
 * Optionally looks up real-time weather from OpenWeatherMap when coords are provided.
 */
export const assembleContext = registerCapability({
  name: 'context.assemble',
  chatTool: true,
  description:
    "Assemble a context snapshot capturing time of day, season, occasion, optional weather, and optional calendar context. Used as input to outfit.generate.",
  input,
  output,

  async execute({ occasion, weather, location, now, calendarContext }) {
    const { userId, source } = getRequestContext();
    const date = now ? new Date(now) : new Date();

    let resolvedWeather = weather ?? null;
    if (!resolvedWeather && location) {
      try {
        resolvedWeather = await fetchWeather(location.lat, location.lon);
      } catch (err) {
        // Weather is best-effort — don't fail the whole context assembly
        console.warn('[context.assemble] weather fetch failed:', err);
      }
    }

    const timeOfDay = computeTimeOfDay(date);
    const season = computeSeason(date);

    const db = getDb();
    const [ctx] = await db
      .insert(contexts)
      .values({
        userId,
        weather: resolvedWeather,
        timeOfDay,
        season,
        occasion,
        calendarContext,
        assembledAt: date,
      })
      .returning({ id: contexts.id });

    if (occasion !== 'everyday') {
      await logEvent({
        userId,
        type: 'context.occasion_updated',
        source,
        payload: { contextId: ctx.id, occasion },
      });
    }

    return {
      contextId: ctx.id,
      weather: resolvedWeather,
      timeOfDay,
      season,
      occasion,
      calendarContext,
    };
  },
});

function computeTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours();
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

function computeSeason(date: Date): 'spring' | 'summer' | 'fall' | 'winter' {
  // Northern hemisphere astronomical-ish seasons.
  // Future: derive from latitude when location is known.
  const month = date.getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}
