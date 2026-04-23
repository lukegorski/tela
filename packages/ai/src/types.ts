import type { z } from 'zod';

/**
 * Defines an AI operation that the gateway can execute.
 * Each operation has a name, model, input/output schemas, and a prompt reference.
 */
export interface AIOperation<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> {
  name: string;
  description: string;
  model: string;
  promptName: string;
  input: TInput;
  output: TOutput;
}

/**
 * Result from an AI gateway call, including provenance metadata.
 */
export interface AICallResult<T> {
  data: T;
  provenance: AICallProvenance;
}

export interface AICallProvenance {
  generationId: string;
  model: string;
  promptName: string;
  promptVersionId: string;
  latencyMs: number;
  costCents: number;
}

/**
 * Provider interface — abstraction over OpenAI or any other AI service.
 * Swap providers by implementing this interface.
 */
export interface AIProvider {
  chat(params: ChatParams): Promise<ChatResponse>;
  chatWithVision(params: VisionParams): Promise<ChatResponse>;
}

export interface ChatParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface VisionParams extends ChatParams {
  imageUrls: string[];
}

export interface ChatResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

/**
 * Cost per token for a given model, in fractional cents.
 * inputCostPer1k and outputCostPer1k are in cents per 1000 tokens.
 */
export interface ModelPricing {
  inputCostPer1k: number;
  outputCostPer1k: number;
}
