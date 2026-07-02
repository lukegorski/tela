/**
 * Natural-language fit-guidance prompt for Fashn's tryon-max model, built
 * from an item's analysis columns. Ported verbatim from the legacy app's
 * `src/lib/fashn.ts#buildFitPrompt` — the wording is tuned to steer
 * tryon-max away from skin-tight renders and cropped/longline hem mistakes,
 * so keep changes in lockstep with observed output quality.
 */

/** The closet_items analysis columns the prompt is built from (all nullable in the DB). */
export interface FitPromptFields {
  subcategory: string | null;
  fit: string | null;
  length: string | null;
  sleeveLength: string | null;
}

export function buildFitPrompt(fields: FitPromptFields): string {
  const parts: string[] = [];

  const length = fields.length || 'standard';
  const fit = fields.fit || 'regular';
  const subcategory = fields.subcategory || 'garment';

  if (length === 'cropped') {
    parts.push(`This is a cropped ${fit} fit ${subcategory}.`);
    parts.push('The hem ends at the natural waist, above the pants waistband.');
  } else if (length === 'longline') {
    parts.push(`This is a longline ${fit} fit ${subcategory}.`);
    parts.push('The hem extends well past the hip.');
  } else {
    parts.push(`This is a ${fit} fit ${subcategory}.`);
  }

  if (fields.sleeveLength && fields.sleeveLength !== 'sleeveless') {
    const sleeveMap: Record<string, string> = {
      short: 'short sleeves',
      half: 'wide half-length sleeves',
      'three-quarter': 'three-quarter length sleeves',
      long: 'long sleeves',
    };
    parts.push(`It has ${sleeveMap[fields.sleeveLength] || fields.sleeveLength}.`);
  }

  if (fit === 'relaxed' || fit === 'oversized') {
    parts.push('Not skin-tight.');
  }

  return parts.join(' ');
}
