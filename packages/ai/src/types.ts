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
  /** Optional — providers without image support throw on call */
  imageEdit?(params: ImageEditParams): Promise<ImageResponse>;
}

export interface ImageEditParams {
  /** The orchestration model (gpt-5.4 — selects/calls the image tool) */
  model: string;
  /** The image generation tool model (gpt-image-1.5) */
  imageModel: string;
  /** Source image as data URL (data:image/jpeg;base64,...) */
  sourceImageDataUrl: string;
  /** Edit prompt */
  prompt: string;
  /** Output dimensions, e.g. "1024x1536" */
  size: string;
  /** "low" | "medium" | "high" — gpt-image-1.5 quality tier */
  quality?: 'low' | 'medium' | 'high';
  /** "auto" | "low" | "high" — input fidelity, controls how much of the original is preserved */
  inputFidelity?: 'auto' | 'low' | 'high';
}

export interface ImageResponse {
  /** PNG bytes returned by the model */
  pngBuffer: Buffer;
  /** Reported number of images generated (usually 1) */
  imageCount: number;
  /** The model the provider actually used */
  model: string;
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
