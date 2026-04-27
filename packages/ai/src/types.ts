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
  /**
   * Multi-turn chat with optional tool definitions. Used by the chat
   * capability to support function-calling. Optional — providers without
   * tool support throw on call.
   */
  chatMulti?(params: MultiTurnParams): Promise<MultiTurnResponse>;
  /**
   * Streaming variant for the final text round. Yields text deltas as they
   * arrive, terminating with a single 'done' event holding the full
   * message + usage. Optional.
   */
  chatMultiStream?(params: MultiTurnStreamParams): AsyncGenerator<StreamEvent, void, unknown>;
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

// ─── Multi-turn + tool calling (Phase 9.1) ───

/**
 * One message in a multi-turn dialogue. Mirrors OpenAI's chat completion
 * message shape but provider-agnostic.
 *
 * - `role: 'system'` / `'user'` / `'assistant'` — text turns
 * - `role: 'tool'` — the result of executing a tool the assistant requested.
 *   Must reference the tool_call_id from the assistant message.
 * - An assistant message may have `content: null` if it's only emitting
 *   tool_calls.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /**
   * User-only multipart content (text + image_url parts). When set on a
   * 'user' message, providers emit this in place of `content` to enable
   * vision input. Assistant / system / tool messages keep using `content`
   * — they never need multipart in practice.
   *
   * Parallel field (rather than widening `content`) so existing string
   * callers and the chat persistence layer (which writes `content` to a
   * text column) stay valid.
   */
  contentParts?: ChatMessageContentPart[];
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

/**
 * One part of a multipart user message — text fragment or image URL.
 * `image_url.url` is provider-fetchable (signed URLs work; OpenAI fetches
 * server-side).
 */
export type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
    };

/**
 * A single tool invocation requested by the assistant. We normalize the
 * argument payload to a parsed object — providers that return raw JSON
 * strings get parsed at the boundary.
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * A tool the assistant is allowed to call. `parameters` is a JSON Schema
 * describing the input shape — typically derived from the corresponding
 * capability's Zod input schema.
 */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface MultiTurnParams {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  /** When tools are present, force the model to either pick one ("auto") or skip tools entirely ("none"). Default 'auto'. */
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
}

export interface MultiTurnResponse {
  /** The assistant message returned by the model. May contain tool_calls and/or content. */
  message: ChatMessage;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  /** OpenAI's stop reason: 'stop' (text), 'tool_calls', 'length', etc. */
  finishReason: string;
}

// ─── Streaming (Phase 9.2) ───

/**
 * One event emitted by the streaming chat call. The chat capability + the
 * SSE endpoint forward these to the client; the client uses them to update
 * the UI incrementally.
 *
 * Tool-call related events do NOT come from the model's stream directly —
 * the chat capability emits them around the synchronous tool dispatch
 * between streaming text rounds. The model's streaming output is purely
 * text deltas (`text-delta` events) plus a terminal `done`.
 */
export type StreamEvent =
  | {
      type: 'text-delta';
      /** A token (or small group of tokens) appended to the current assistant message. */
      content: string;
    }
  | {
      type: 'done';
      /** The fully assembled assistant message. */
      message: ChatMessage;
      usage: { inputTokens: number; outputTokens: number };
      model: string;
      finishReason: string;
    };

/**
 * Like MultiTurnParams but without `tools` — the streaming variant is
 * intended for the FINAL text round of a chat turn, after the synchronous
 * tool dispatch is done. Tool-calling within the stream itself adds enough
 * complexity (deltas of arguments, partial tool invocations) that we keep
 * it out of the MVP.
 */
export interface MultiTurnStreamParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Cost per token for a given model, in fractional cents.
 * inputCostPer1k and outputCostPer1k are in cents per 1000 tokens.
 */
export interface ModelPricing {
  inputCostPer1k: number;
  outputCostPer1k: number;
}
