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
