/**
 * Minimal client for the Fashn try-on API. Not registered as an AIProvider —
 * Fashn is not a chat/image model in the same sense as OpenAI; it's a
 * task-specific try-on service. The chat AI gateway doesn't go through
 * here.
 *
 * Models used (one start function each — their input shapes differ):
 *   tryon-v1.6 — standard garment try-on (startTryOn)
 *   tryon-max  — slower, prompt-guided try-on used for tops in the layered
 *                pipeline (startTryOnMax)
 *   edit       — image editing with a reference image; layers outerwear
 *                over an existing render (startEdit)
 *
 * Endpoints used:
 *   POST {base}/run         → start a prediction, returns { id }
 *   GET  {base}/status/{id} → poll, returns { status, output } where status
 *                              is one of starting | in_queue | processing |
 *                              completed | failed | canceled
 *
 * Auth: Bearer token from FASHN_API_KEY env. We read it lazily on the
 * first call so test setups can stub the env before importing.
 */

const FASHN_BASE_URL = 'https://api.fashn.ai/v1';

function getHeaders(): Record<string, string> {
  const key = process.env.FASHN_API_KEY;
  if (!key) {
    throw new Error('FASHN_API_KEY is required for try-on calls');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
}

/** Categories Fashn's tryon-v1.6 model accepts for the `category` field. */
export type FashnCategory = 'tops' | 'bottoms' | 'one-pieces';

/** All terminal + non-terminal states Fashn returns. */
export type FashnStatus =
  | 'starting'
  | 'in_queue'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

const NON_TERMINAL: ReadonlySet<FashnStatus> = new Set(['starting', 'in_queue', 'processing']);

export interface FashnStatusResponse {
  id: string;
  status: FashnStatus;
  output?: unknown;
  /**
   * Live-observed 2026-07-02: an OBJECT for poll-time failures (e.g. invalid
   * model_image URL), not the string this was originally typed as —
   * interpolating it directly renders "[object Object]". Serialize before
   * putting it in a message.
   */
  error?: unknown;
}

/** POST {base}/run for any model. Returns the Fashn prediction ID. */
async function startRun(modelName: string, inputs: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${FASHN_BASE_URL}/run`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ model_name: modelName, inputs }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fashn /run (${modelName}) failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error(`Fashn /run (${modelName}) returned no id`);
  return data.id;
}

/**
 * Start a tryon-v1.6 prediction (the standard garment-try-on model).
 * Returns the Fashn prediction ID.
 */
export async function startTryOn(params: {
  modelImageUrl: string;
  garmentImageUrl: string;
  category: FashnCategory;
  /** "quality" or "performance". Default "quality" — what production uses. */
  mode?: 'quality' | 'performance';
}): Promise<string> {
  return startRun('tryon-v1.6', {
    model_image: params.modelImageUrl,
    garment_image: params.garmentImageUrl,
    category: params.category,
    mode: params.mode ?? 'quality',
    garment_photo_type: 'flat-lay',
  });
}

/**
 * Start a tryon-max prediction — the slower, higher-fidelity try-on model
 * that accepts a natural-language prompt for fit/styling guidance (see
 * buildFitPrompt in @tela/capabilities). Used for tops in the layered
 * pipeline. Typically 60–90s; poll with a higher maxIterations than v1.6.
 */
export async function startTryOnMax(params: {
  modelImageUrl: string;
  productImageUrl: string;
  /** Natural-language fit guidance, e.g. "This is a cropped relaxed fit tee." */
  prompt: string;
  /**
   * Explicit sampling seed. Fashn defaults to a FIXED seed (42), so identical
   * inputs reproduce identical outputs — pass a random seed to escape a bad
   * deterministic result (e.g. the framing retry in tryon/process.ts).
   */
  seed?: number;
}): Promise<string> {
  return startRun('tryon-max', {
    model_image: params.modelImageUrl,
    product_image: params.productImageUrl,
    prompt: params.prompt,
    resolution: '1k',
    generation_mode: 'quality',
    seed: params.seed,
  });
}

/**
 * Start an edit prediction — image editing with a reference garment image
 * (image_context). Used to layer outerwear over an already-rendered outfit,
 * which the try-on models can't do without replacing the garments underneath.
 * Typically 60–90s; poll with a higher maxIterations than v1.6.
 */
export async function startEdit(params: {
  imageUrl: string;
  prompt: string;
  /** The garment reference image the edit should pull from. */
  contextImageUrl: string;
  /** Explicit sampling seed — see startTryOnMax. */
  seed?: number;
}): Promise<string> {
  return startRun('edit', {
    image: params.imageUrl,
    prompt: params.prompt,
    image_context: params.contextImageUrl,
    resolution: '1k',
    generation_mode: 'quality',
    seed: params.seed,
  });
}

/**
 * Fetch the current status of a Fashn prediction.
 */
export async function getStatus(predictionId: string): Promise<FashnStatusResponse> {
  const res = await fetch(`${FASHN_BASE_URL}/status/${predictionId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fashn /status failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return (await res.json()) as FashnStatusResponse;
}

/**
 * Extract the output image URL from Fashn's somewhat-polymorphic response.
 * Older models return a string; tryon-v1.6 returns { images: [{url}] };
 * try-on-max returns { try_on_0: 'url' }. Defensive against all of them.
 */
export function extractOutputUrl(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const first = output[0];
    return typeof first === 'string' ? first : (first as { url?: string })?.url;
  }
  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    if ('images' in obj && Array.isArray(obj.images)) {
      const first = obj.images[0] as { url?: string } | undefined;
      if (first?.url) return first.url;
    }
    // try-on-max format
    const tryOnKey = Object.keys(obj).find((k) => k.startsWith('try_on'));
    if (tryOnKey && typeof obj[tryOnKey] === 'string') {
      return obj[tryOnKey] as string;
    }
  }
  return undefined;
}

/**
 * Poll a Fashn prediction until it reaches a terminal state, or throw if
 * we exceed maxIterations (each iteration waits intervalMs).
 *
 * Defaults: 30 attempts * 2s = 60s ceiling. Long enough for tryon-v1.6
 * which usually finishes in 20–40s.
 */
export async function pollUntilDone(
  predictionId: string,
  options?: { maxIterations?: number; intervalMs?: number },
): Promise<FashnStatusResponse> {
  const maxIterations = options?.maxIterations ?? 30;
  const intervalMs = options?.intervalMs ?? 2000;

  for (let i = 0; i < maxIterations; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const status = await getStatus(predictionId);
    if (!NON_TERMINAL.has(status.status)) return status;
  }
  throw new Error(`Fashn prediction ${predictionId} timed out after ${maxIterations} attempts`);
}
