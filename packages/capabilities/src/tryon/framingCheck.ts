/**
 * Framing validation for try-on renders. Fashn's prompt-guided models
 * (tryon-max, edit) occasionally zoom the composition in — the garments
 * render correctly but the model's lower body leaves the frame. Because
 * Fashn runs with a fixed default seed, a bad frame reproduces identically
 * on plain retry; the pipeline uses this check to detect the zoom and
 * re-run the step with an explicit random seed (see process.ts).
 *
 * Detection is a single cheap vision call (gpt-5.4-mini, ~1.4k tokens).
 * The discriminator is FEET VISIBILITY — the failure mode always loses the
 * lower body, while acceptable renders may legitimately crop the scalp.
 *
 * Fail-open by design: if the check itself errors (rate limit, provider
 * outage, malformed output), we return null and the pipeline accepts the
 * image rather than failing a $0.12 try-on over a $0.001 validator.
 */
import { call } from '@tela/ai';
import { getPrompt } from '@tela/prompts';

export interface FramingResult {
  feetVisible: boolean;
  lowestVisiblePart: string | null;
  framing: string | null;
}

/**
 * Parse the validator's JSON output defensively. Returns null when the
 * shape is unusable (treated as check-unavailable, never as a failure).
 */
export function parseFramingResult(data: unknown): FramingResult | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.feetVisible !== 'boolean') return null;
  return {
    feetVisible: obj.feetVisible,
    lowestVisiblePart: typeof obj.lowestVisiblePart === 'string' ? obj.lowestVisiblePart : null,
    framing: typeof obj.framing === 'string' ? obj.framing : null,
  };
}

export async function checkFraming(params: {
  userId: string;
  imageUrl: string;
}): Promise<FramingResult | null> {
  try {
    const prompt = await getPrompt('tryon.framing-check');
    const result = await call<unknown>({
      operation: 'tryon.framing-check',
      userId: params.userId,
      promptName: prompt.name,
      promptVersionId: prompt.versionId,
      promptTemplate: prompt.template,
      userPrompt: 'Validate the framing of this try-on image.',
      model: 'gpt-5.4-mini',
      imageUrls: [params.imageUrl],
      responseFormat: 'json',
      temperature: 0,
    });
    return parseFramingResult(result.data);
  } catch {
    // Fail open — validator problems must never fail the try-on itself.
    return null;
  }
}
