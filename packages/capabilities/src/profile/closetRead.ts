import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, closetItems, styleProfiles, styleProfileVersions } from '@tela/db';
import { call } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const dimensionsSchema = z.object({
  minimalMaximal: z.number().min(0).max(1),
  classicTrendy: z.number().min(0).max(1),
  casualFormal: z.number().min(0).max(1),
  subtleBold: z.number().min(0).max(1),
  structuredFluid: z.number().min(0).max(1),
});

const dimensionsOutputSchema = z.object({
  dimensions: dimensionsSchema,
  confidence: dimensionsSchema,
  signals: z.array(
    z.object({
      tag: z.string(),
      strength: z.number().min(-1).max(1),
    }),
  ),
});

const input = z.object({
  locale: z.string().default('en'),
  reason: z.string().default('initial_read'),
});

const output = z.object({
  profileId: z.string().uuid(),
  versionId: z.string().uuid(),
  profileText: z.string(),
  dimensions: dimensionsSchema,
  itemsAnalyzed: z.number(),
  totalCostCents: z.number(),
});

/**
 * Generate a complete style profile for a user by analyzing their entire closet.
 *
 * Two-step pipeline:
 *   1. AI generates a rich prose "closet read" describing the user's style identity
 *   2. AI extracts numerical dimensions + signals from the prose
 *
 * The result is saved as the user's current style_profile (and a versioned snapshot
 * is appended to style_profile_versions).
 */
export const closetRead = registerCapability({
  name: 'profile.closetRead',
  description:
    "Generate or refresh a user's style profile by analyzing their entire wardrobe. Produces both a rich prose description (the closet read) and 5-axis numerical dimensions (minimalMaximal, classicTrendy, casualFormal, subtleBold, structuredFluid).",
  input,
  output,

  async execute({ locale, reason }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // Load all closet items for this user
    const items = await db
      .select({
        category: closetItems.category,
        subcategory: closetItems.subcategory,
        primaryColor: closetItems.primaryColor,
        secondaryColor: closetItems.secondaryColor,
        pattern: closetItems.pattern,
        style: closetItems.style,
        fit: closetItems.fit,
        formalityScore: closetItems.formalityScore,
        materialWeight: closetItems.materialWeight,
        seasonCompatibility: closetItems.seasonCompatibility,
        description: closetItems.description,
        wearCount: closetItems.wearCount,
      })
      .from(closetItems)
      .where(eq(closetItems.userId, userId));

    if (items.length === 0) {
      throw new Error(
        'Cannot generate a closet read for an empty wardrobe. Add at least 5 items first.',
      );
    }

    await logEvent({
      userId,
      type: 'profile.closet_read_started',
      source,
      payload: { itemCount: items.length, reason },
    });

    // Format wardrobe as a structured summary for the AI
    const wardrobeSummary = formatWardrobeForPrompt(items);

    // ─── Step 1: Closet read (prose) ───
    const closetReadPrompt = await getPrompt('profile.closet_read');
    const proseResult = await call<string>({
      operation: 'profile.closetRead',
      userId,
      promptName: closetReadPrompt.name,
      promptVersionId: closetReadPrompt.versionId,
      promptTemplate: closetReadPrompt.template,
      userPrompt: 'Read this closet and write the style profile.',
      model: 'gpt-5.4',
      variables: { wardrobe_summary: wardrobeSummary, locale },
      temperature: 0.6,
      // Output is markdown text, not JSON
      responseFormat: 'text',
    });

    // The AI gateway will try to parse as JSON first then fall back to text;
    // for prose responses the data field is the raw string.
    const profileText =
      typeof proseResult.data === 'string' ? proseResult.data : String(proseResult.data);

    // ─── Step 2: Derive numerical dimensions ───
    const dimensionsPrompt = await getPrompt('profile.derive_dimensions');
    const dimensionsResult = await call<z.infer<typeof dimensionsOutputSchema>>({
      operation: 'profile.deriveDimensions',
      userId,
      promptName: dimensionsPrompt.name,
      promptVersionId: dimensionsPrompt.versionId,
      promptTemplate: dimensionsPrompt.template,
      userPrompt: 'Extract dimensions from the profile.',
      model: 'gpt-5.4-mini',
      variables: { profile_text: profileText },
      temperature: 0.1,
      responseFormat: 'json',
    });

    const parsed = dimensionsOutputSchema.safeParse(dimensionsResult.data);
    if (!parsed.success) {
      throw new Error(`AI returned invalid dimensions: ${parsed.error.message}`);
    }

    const totalCostCents =
      proseResult.provenance.costCents + dimensionsResult.provenance.costCents;

    // ─── Step 3: Save profile ───
    // Upsert: insert if no profile exists, otherwise update
    const existing = await db.query.styleProfiles.findFirst({
      where: eq(styleProfiles.userId, userId),
    });

    let profileId: string;

    if (existing) {
      profileId = existing.id;
      await db
        .update(styleProfiles)
        .set({
          profileText,
          dimensions: parsed.data.dimensions,
          confidence: parsed.data.confidence,
          signals: parsed.data.signals.map((s) => ({
            ...s,
            source: 'closet_read' as const,
          })),
          updatedAt: new Date(),
        })
        .where(eq(styleProfiles.id, profileId));
    } else {
      const [created] = await db
        .insert(styleProfiles)
        .values({
          userId,
          profileText,
          dimensions: parsed.data.dimensions,
          confidence: parsed.data.confidence,
          signals: parsed.data.signals.map((s) => ({
            ...s,
            source: 'closet_read' as const,
          })),
        })
        .returning({ id: styleProfiles.id });
      profileId = created.id;
    }

    // Append a versioned snapshot
    const [version] = await db
      .insert(styleProfileVersions)
      .values({
        profileId,
        userId,
        profileText,
        dimensions: parsed.data.dimensions,
        confidence: parsed.data.confidence,
        signals: parsed.data.signals.map((s) => ({
          ...s,
          source: 'closet_read' as const,
        })),
        reason,
        triggeredBy: 'profile.closetRead',
      })
      .returning({ id: styleProfileVersions.id });

    // Update profile to point at the new version
    await db
      .update(styleProfiles)
      .set({ latestVersionId: version.id })
      .where(eq(styleProfiles.id, profileId));

    // ─── Events ───
    await logEvent({
      userId,
      type: 'profile.closet_read_completed',
      source,
      payload: {
        profileId,
        versionId: version.id,
        itemsAnalyzed: items.length,
        totalCostCents,
      },
    });

    await logEvent({
      userId,
      type: 'profile.dimensions_derived',
      source,
      payload: { profileId, dimensions: parsed.data.dimensions },
    });

    return {
      profileId,
      versionId: version.id,
      profileText,
      dimensions: parsed.data.dimensions,
      itemsAnalyzed: items.length,
      totalCostCents,
    };
  },
});

// ─── Helpers ───

type ItemRow = {
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  pattern: string | null;
  style: string | null;
  fit: string | null;
  formalityScore: number;
  materialWeight: string;
  seasonCompatibility: string[];
  description: string | null;
  wearCount: number;
};

function formatWardrobeForPrompt(items: ItemRow[]): string {
  const byCategory = new Map<string, ItemRow[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const lines: string[] = [`Total items: ${items.length}`, ''];

  for (const [category, categoryItems] of [...byCategory.entries()].sort()) {
    lines.push(`### ${category} (${categoryItems.length})`);
    for (const item of categoryItems) {
      const parts = [
        item.primaryColor,
        item.secondaryColor ? `+${item.secondaryColor}` : null,
        item.subcategory ?? '',
        item.pattern && item.pattern !== 'solid' ? `(${item.pattern})` : null,
        item.fit ? `[${item.fit}]` : null,
        `formality:${item.formalityScore.toFixed(2)}`,
        item.wearCount > 0 ? `worn:${item.wearCount}x` : null,
      ].filter(Boolean);
      lines.push(`- ${parts.join(' ')} — ${item.description ?? ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
