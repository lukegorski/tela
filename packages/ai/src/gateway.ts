import { getDb, generations } from '@tela/db';
import type { AIProvider, ChatParams, AICallResult, AICallProvenance } from './types.js';
import { calculateCost } from './pricing.js';
import { OpenAIProvider } from './providers/openai.js';
import { checkRateLimitsBeforeCall, checkRateLimitsAfterCall } from './rateLimits.js';

let _provider: AIProvider | null = null;

/**
 * Set the AI provider. Call this once during application startup.
 * Use MockProvider for tests, OpenAIProvider for production.
 */
export function setProvider(provider: AIProvider): void {
  _provider = provider;
}

/**
 * Initialize the default OpenAI provider from environment.
 */
export function initDefaultProvider(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is required');
  _provider = new OpenAIProvider(apiKey);
}

function getProvider(): AIProvider {
  if (!_provider) {
    initDefaultProvider();
  }
  return _provider!;
}

export interface GatewayCallParams {
  operation: string;
  userId: string;
  promptName: string;
  promptVersionId: string;
  promptTemplate: string;
  userPrompt: string;
  model: string;
  variables?: Record<string, string>;
  imageUrls?: string[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

/**
 * Execute an AI call through the gateway.
 * Handles provider dispatch, cost tracking, provenance logging, and retry.
 *
 * Every call is logged to the generations table. No exceptions.
 */
export async function call<T>(params: GatewayCallParams): Promise<AICallResult<T>> {
  // Enforce daily rate limits BEFORE incurring cost
  await checkRateLimitsBeforeCall(params.userId, params.operation);

  const provider = getProvider();
  const start = performance.now();

  // Fill template variables
  let systemPrompt = params.promptTemplate;
  if (params.variables) {
    for (const [key, value] of Object.entries(params.variables)) {
      systemPrompt = systemPrompt.replaceAll(`{{${key}}}`, value);
    }
  }

  const chatParams: ChatParams = {
    model: params.model,
    systemPrompt,
    userPrompt: params.userPrompt,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    responseFormat: params.responseFormat,
  };

  // Call with retry (up to 3 attempts for transient failures)
  let lastError: Error | null = null;
  let response;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = params.imageUrls?.length
        ? await provider.chatWithVision({ ...chatParams, imageUrls: params.imageUrls })
        : await provider.chat(chatParams);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 3) {
        // Exponential backoff: 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  if (!response) {
    throw lastError ?? new Error('AI call failed after 3 attempts');
  }

  const latencyMs = performance.now() - start;
  const costCents = calculateCost(
    response.model,
    response.usage.inputTokens,
    response.usage.outputTokens,
  );

  // Parse response
  let parsedOutput: T;
  try {
    parsedOutput = JSON.parse(response.content) as T;
  } catch {
    parsedOutput = response.content as unknown as T;
  }

  // Log to generations table — non-negotiable provenance
  const db = getDb();
  const [generation] = await db
    .insert(generations)
    .values({
      userId: params.userId,
      operation: params.operation,
      promptName: params.promptName,
      promptVersionId: params.promptVersionId,
      model: response.model,
      inputSnapshot: {
        systemPrompt,
        userPrompt: params.userPrompt,
        imageUrls: params.imageUrls,
        temperature: params.temperature,
      },
      rawOutput: response.content,
      parsedOutput: parsedOutput as unknown as Record<string, unknown>,
      latencyMs,
      costCents,
    })
    .returning({ id: generations.id });

  const provenance: AICallProvenance = {
    generationId: generation.id,
    model: response.model,
    promptName: params.promptName,
    promptVersionId: params.promptVersionId,
    latencyMs,
    costCents,
  };

  // Check per-call cost cap after the call completes (the generation is
  // already logged so the spend is recorded — this surfaces a runaway prompt
  // as a loud error so we know to investigate). Caller catches RateLimitError
  // and decides how to surface to the user.
  await checkRateLimitsAfterCall(params.userId, params.operation, costCents);

  return { data: parsedOutput, provenance };
}

// ─── Image edit (gpt-image-1.5 etc.) ───

export interface GatewayImageParams {
  operation: string;
  userId: string;
  promptName: string;
  promptVersionId: string;
  prompt: string;
  /** Source image as data URL */
  sourceImageDataUrl: string;
  /** Orchestration model (e.g. 'gpt-5.4') */
  model?: string;
  /** Image generation tool model (e.g. 'gpt-image-1.5') */
  imageModel?: string;
  size?: string;
  quality?: 'low' | 'medium' | 'high';
  inputFidelity?: 'auto' | 'low' | 'high';
}

export interface GatewayImageResult {
  pngBuffer: Buffer;
  provenance: AICallProvenance;
}

/**
 * Generate / edit an image via the gateway. Handles rate limits, retries,
 * and provenance logging same as call(). Cost is per-image based on the
 * image model in pricing.ts (image pricing is encoded as outputCostPer1k
 * representing cost per 1000 images).
 */
export async function image(params: GatewayImageParams): Promise<GatewayImageResult> {
  const provider = getProvider();
  if (!provider.imageEdit) {
    throw new Error('Configured AI provider does not support image generation');
  }

  await checkRateLimitsBeforeCall(params.userId, params.operation);

  const start = performance.now();
  const orchModel = params.model ?? 'gpt-5.4';
  const imageModel = params.imageModel ?? 'gpt-image-1.5';

  let lastError: Error | null = null;
  let response: Awaited<ReturnType<NonNullable<AIProvider['imageEdit']>>> | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await provider.imageEdit({
        model: orchModel,
        imageModel,
        sourceImageDataUrl: params.sourceImageDataUrl,
        prompt: params.prompt,
        size: params.size ?? '1024x1536',
        quality: params.quality ?? 'medium',
        inputFidelity: params.inputFidelity ?? 'high',
      });
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
  if (!response) throw lastError ?? new Error('Image edit failed after 3 attempts');

  const latencyMs = performance.now() - start;
  // calculateCost uses outputCostPer1k as cents per 1000 tokens; for image
  // models we encode pricing as cost per 1000 images, so passing outputTokens=1000
  // yields cost-per-image, and we multiply by image count.
  const costCents = calculateCost(response.model, 0, 1000) * response.imageCount;

  const db = getDb();
  const [generation] = await db
    .insert(generations)
    .values({
      userId: params.userId,
      operation: params.operation,
      promptName: params.promptName,
      promptVersionId: params.promptVersionId,
      model: response.model,
      inputSnapshot: { prompt: params.prompt, size: params.size, quality: params.quality },
      rawOutput: `<image bytes: ${response.pngBuffer.length}>`,
      parsedOutput: { imageCount: response.imageCount, byteSize: response.pngBuffer.length },
      latencyMs,
      costCents,
    })
    .returning({ id: generations.id });

  await checkRateLimitsAfterCall(params.userId, params.operation, costCents);

  return {
    pngBuffer: response.pngBuffer,
    provenance: {
      generationId: generation.id,
      model: response.model,
      promptName: params.promptName,
      promptVersionId: params.promptVersionId,
      latencyMs,
      costCents,
    },
  };
}
