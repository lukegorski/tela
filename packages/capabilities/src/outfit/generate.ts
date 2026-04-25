import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  getDb,
  closetItems,
  contexts,
  outfits,
  outfitItems,
  styleProfiles,
  stylistRules,
} from '@tela/db';
import { call } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const roleSchema = z.enum(['top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessory']);

const aiOutfitSchema = z.object({
  name: z.string().min(1).max(80),
  items: z.array(
    z.object({
      closetItemId: z.string().uuid(),
      role: roleSchema,
    }),
  ),
  rationale: z.string(),
});

const aiResponseSchema = z.object({
  outfits: z.array(aiOutfitSchema),
});

const input = z.object({
  contextId: z.string().uuid(),
  count: z.number().int().min(1).max(5).default(3),
});

const outfitOutputSchema = z.object({
  outfitId: z.string().uuid(),
  name: z.string(),
  items: z.array(
    z.object({
      closetItemId: z.string().uuid(),
      role: roleSchema,
    }),
  ),
  rationale: z.string(),
  pairingKey: z.string(),
});

const output = z.object({
  outfits: z.array(outfitOutputSchema),
  generationId: z.string().uuid(),
  costCents: z.number(),
  duplicatesRejected: z.number(),
});

export const generateOutfits = registerCapability({
  name: 'outfit.generate',
  chatTool: true,
  description:
    "Generate outfit suggestions for a user given a context. Uses the user's style profile, the styling rules, and their wardrobe. Deduplicates against previously-generated outfits via pairing keys.",
  input,
  output,

  async execute({ contextId, count }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // ─── Load context ───
    const ctx = await db.query.contexts.findFirst({
      where: and(eq(contexts.id, contextId), eq(contexts.userId, userId)),
    });
    if (!ctx) throw new Error('Context not found or does not belong to user');

    // ─── Load style profile ───
    const profile = await db.query.styleProfiles.findFirst({
      where: eq(styleProfiles.userId, userId),
    });
    if (!profile) {
      throw new Error('No style profile exists for this user. Run profile.closetRead first.');
    }

    // ─── Load wardrobe (filtered by season for relevance) ───
    const allItems = await db
      .select()
      .from(closetItems)
      .where(eq(closetItems.userId, userId));

    // Season-aware filter — keep an item if it works in the current season
    // (or has no season tags at all)
    const seasonRelevant = allItems.filter((item) => {
      const seasons = (item.seasonCompatibility as string[]) ?? [];
      return seasons.length === 0 || seasons.includes(ctx.season);
    });

    if (seasonRelevant.length < 3) {
      throw new Error(
        `Wardrobe too small for ${ctx.season}: only ${seasonRelevant.length} items match. Add more items.`,
      );
    }

    // ─── Load top stylist rules ───
    const rules = await db
      .select({ category: stylistRules.category, rule: stylistRules.rule })
      .from(stylistRules)
      .where(eq(stylistRules.active, true))
      .orderBy(desc(stylistRules.priority))
      .limit(15);

    // ─── Load forbidden pairings (existing outfits for this user) ───
    const existing = await db
      .select({ pairingKey: outfits.pairingKey })
      .from(outfits)
      .where(eq(outfits.userId, userId))
      .orderBy(desc(outfits.createdAt))
      .limit(50);
    const forbiddenKeys = new Set(existing.map((o) => o.pairingKey));

    // ─── Build prompt context ───
    const styleProfileText = renderStyleProfile(profile);
    const stylistRulesText = renderStylistRules(rules);
    const contextSummary = renderContext(ctx);
    const wardrobeText = renderWardrobe(seasonRelevant);
    const forbiddenText =
      existing.length === 0
        ? '(none — this is the first outfit generation for this user)'
        : `${existing.length} prior outfits already exist. Their pairing keys are below — never produce an outfit whose item-set hashes to one of these.\n${[...forbiddenKeys].slice(0, 30).join('\n')}`;

    // ─── Call AI ───
    const prompt = await getPrompt('outfit.generate');
    const result = await call<z.infer<typeof aiResponseSchema>>({
      operation: 'outfit.generate',
      userId,
      promptName: prompt.name,
      promptVersionId: prompt.versionId,
      promptTemplate: prompt.template,
      userPrompt: `Generate ${count} outfits for the context above.`,
      model: 'gpt-5.4',
      variables: {
        style_profile: styleProfileText,
        stylist_rules: stylistRulesText,
        context_summary: contextSummary,
        wardrobe_items: wardrobeText,
        forbidden_pairings: forbiddenText,
        locale: 'en',
      },
      temperature: 0.7,
      responseFormat: 'json',
    });

    const parsed = aiResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new Error(`AI returned invalid outfits: ${parsed.error.message}`);
    }

    // ─── Validate, dedupe, persist ───
    const validItemIds = new Set(seasonRelevant.map((i) => i.id));
    const savedOutfits: z.infer<typeof outfitOutputSchema>[] = [];
    let duplicatesRejected = 0;

    for (const candidate of parsed.data.outfits) {
      // Reject outfits that reference items the user doesn't own
      const allValid = candidate.items.every((i) => validItemIds.has(i.closetItemId));
      if (!allValid) {
        duplicatesRejected++;
        continue;
      }

      // Compute pairing key from sorted item IDs
      const itemIds = candidate.items.map((i) => i.closetItemId).sort();
      const pairingKey = createHash('sha256')
        .update(itemIds.join('|'))
        .digest('hex')
        .slice(0, 32);

      if (forbiddenKeys.has(pairingKey)) {
        duplicatesRejected++;
        continue;
      }
      forbiddenKeys.add(pairingKey);

      // Persist the outfit + items in a transaction
      const [outfit] = await db
        .insert(outfits)
        .values({
          userId,
          generationId: result.provenance.generationId,
          contextId,
          rationale: candidate.rationale,
          name: candidate.name,
          pairingKey,
        })
        .returning({ id: outfits.id });

      await db.insert(outfitItems).values(
        candidate.items.map((i) => ({
          outfitId: outfit.id,
          closetItemId: i.closetItemId,
          role: i.role,
        })),
      );

      savedOutfits.push({
        outfitId: outfit.id,
        name: candidate.name,
        items: candidate.items,
        rationale: candidate.rationale,
        pairingKey,
      });
    }

    if (savedOutfits.length === 0) {
      throw new Error(
        `AI produced ${parsed.data.outfits.length} outfits but all were rejected (duplicates or invalid items).`,
      );
    }

    await logEvent({
      userId,
      type: 'outfit.generated',
      source,
      payload: {
        contextId,
        outfitCount: savedOutfits.length,
        duplicatesRejected,
        generationId: result.provenance.generationId,
      },
    });

    return {
      outfits: savedOutfits,
      generationId: result.provenance.generationId,
      costCents: result.provenance.costCents,
      duplicatesRejected,
    };
  },
});

// ─── Renderers ───

function renderStyleProfile(profile: typeof styleProfiles.$inferSelect): string {
  const dims = Object.entries(profile.dimensions as unknown as Record<string, number>)
    .map(([k, v]) => `  ${k}: ${v.toFixed(2)}`)
    .join('\n');
  const signals = profile.signals
    .filter((s) => Math.abs(s.strength) > 0.3)
    .slice(0, 10)
    .map((s) => `  ${s.tag} (${s.strength >= 0 ? '+' : ''}${s.strength})`)
    .join('\n');
  return `Profile text:\n${profile.profileText}\n\nDimensions (0=left, 1=right):\n${dims}\n\nKey signals:\n${signals || '  (none yet)'}`;
}

function renderStylistRules(rules: Array<{ category: string; rule: string }>): string {
  return rules.map((r, i) => `[${i + 1}] (${r.category}) ${r.rule}`).join('\n\n');
}

function renderContext(ctx: {
  occasion: string;
  timeOfDay: string;
  season: string;
  weather: unknown;
  calendarContext: string | null;
}): string {
  const lines = [
    `Occasion: ${ctx.occasion}`,
    `Time of day: ${ctx.timeOfDay}`,
    `Season: ${ctx.season}`,
  ];
  if (ctx.weather) {
    const w = ctx.weather as {
      temperatureCelsius: number;
      condition: string;
      windSpeedKph: number;
      location: string;
    };
    lines.push(
      `Weather: ${w.temperatureCelsius}°C, ${w.condition}, wind ${w.windSpeedKph}km/h (${w.location})`,
    );
  }
  if (ctx.calendarContext) {
    lines.push(`Calendar: ${ctx.calendarContext}`);
  }
  return lines.join('\n');
}

function renderWardrobe(items: Array<typeof closetItems.$inferSelect>): string {
  return items
    .map((item) => {
      const desc = [
        item.primaryColor,
        item.secondaryColor ? `+${item.secondaryColor}` : null,
        item.subcategory ?? '',
        item.pattern && item.pattern !== 'solid' ? `(${item.pattern})` : null,
        item.fit ? `[${item.fit}]` : null,
        `formality:${item.formalityScore.toFixed(2)}`,
      ]
        .filter(Boolean)
        .join(' ');
      return `id=${item.id} category=${item.category} ${desc}${
        item.description ? ` — ${item.description}` : ''
      }`;
    })
    .join('\n');
}
