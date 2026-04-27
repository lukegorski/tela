import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, itemPhotos } from '@tela/db';
import { call } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';

const input = z.object({
  photoId: z.string().uuid(),
  locale: z.string().default('en'),
});

const metadata = z.object({
  category: z.string(),
  subcategory: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string().nullable(),
  pattern: z.string().nullable(),
  style: z.string().nullable(),
  fit: z.string().nullable(),
  length: z.string().nullable(),
  sleeveLength: z.string().nullable(),
  formalityScore: z.number().min(0).max(1),
  materialWeight: z.enum(['light', 'medium', 'heavy']),
  material: z.string().nullable(),
  seasonCompatibility: z.array(z.enum(['spring', 'summer', 'fall', 'winter'])),
  description: z.string(),
});

const output = z.object({
  metadata,
  generationId: z.string().uuid(),
  costCents: z.number(),
});

/**
 * Analyze a wardrobe item photo using the AI gateway.
 * Returns structured metadata (category, color, season, formality, etc.)
 * suitable for passing to wardrobe.addItem.
 */
export const analyzeItem = registerCapability({
  name: 'item.analyze',
  description:
    "Analyze a clothing item photo using AI vision to extract structured metadata: category, color, pattern, style, fit, formality, season compatibility, and a brief description in the user's locale.",
  input,
  output,
  chatTool: true,

  async execute({ photoId, locale }) {
    const { userId } = getRequestContext();
    const db = getDb();

    // Verify photo belongs to user and get the storage path
    const photo = await db.query.itemPhotos.findFirst({
      where: (p, { and, eq: e }) => and(e(p.id, photoId), e(p.userId, userId)),
    });
    if (!photo) {
      throw new Error('Photo not found or does not belong to user');
    }

    // Generate a temporary signed download URL for the AI to read the image
    const supabase = getSupabaseAdmin();
    const { data: signedDownload, error: signError } = await supabase.storage
      .from(ITEM_PHOTOS_BUCKET)
      .createSignedUrl(photo.storagePath, 600);

    if (signError || !signedDownload) {
      throw new Error(`Failed to create signed download URL: ${signError?.message}`);
    }

    // Load the prompt
    const prompt = await getPrompt('item.analyze');

    // Call the AI gateway with the image
    const result = await call<z.infer<typeof metadata>>({
      operation: 'item.analyze',
      userId,
      promptName: prompt.name,
      promptVersionId: prompt.versionId,
      promptTemplate: prompt.template,
      userPrompt: 'Analyze this clothing item.',
      model: 'gpt-5.4-mini',
      variables: { locale },
      imageUrls: [signedDownload.signedUrl],
      responseFormat: 'json',
      temperature: 0.2,
    });

    // Validate AI output against our schema
    const parsed = metadata.safeParse(result.data);
    if (!parsed.success) {
      throw new Error(`AI returned invalid metadata: ${parsed.error.message}`);
    }

    return {
      metadata: parsed.data,
      generationId: result.provenance.generationId,
      costCents: result.provenance.costCents,
    };
  },
});
