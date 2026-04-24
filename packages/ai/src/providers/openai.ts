import OpenAI from 'openai';
import type {
  AIProvider,
  ChatParams,
  ChatResponse,
  VisionParams,
  ImageEditParams,
  ImageResponse,
  MultiTurnParams,
  MultiTurnResponse,
  MultiTurnStreamParams,
  ChatMessage,
  StreamEvent,
} from '../types.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
      response_format: params.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? '',
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  async chatWithVision(params: VisionParams): Promise<ChatResponse> {
    const imageContent: OpenAI.ChatCompletionContentPart[] = params.imageUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    }));

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        {
          role: 'user',
          content: [{ type: 'text', text: params.userPrompt }, ...imageContent],
        },
      ],
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
      response_format: params.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? '',
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  async chatMulti(params: MultiTurnParams): Promise<MultiTurnResponse> {
    // Map our provider-agnostic messages to OpenAI's format. The shapes are
    // close but not identical — OpenAI assistants use `tool_calls`, ours
    // use `toolCalls`; tool messages use `tool_call_id` vs ours `toolCallId`.
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = params.messages.map((m) => {
      switch (m.role) {
        case 'system':
          return { role: 'system', content: m.content ?? '' };
        case 'user':
          return { role: 'user', content: m.content ?? '' };
        case 'assistant': {
          const msg: OpenAI.ChatCompletionAssistantMessageParam = {
            role: 'assistant',
            content: m.content,
          };
          if (m.toolCalls && m.toolCalls.length > 0) {
            msg.tool_calls = m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            }));
          }
          return msg;
        }
        case 'tool':
          if (!m.toolCallId) {
            throw new Error('Tool message missing toolCallId — cannot map to OpenAI format');
          }
          return {
            role: 'tool',
            tool_call_id: m.toolCallId,
            content: m.content ?? '',
          };
      }
    });

    const openaiTools: OpenAI.ChatCompletionTool[] | undefined = params.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: openaiMessages,
      tools: openaiTools,
      tool_choice: params.toolChoice ?? (openaiTools?.length ? 'auto' : undefined),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
    });

    const choice = response.choices[0];
    const msg = choice.message;

    const toolCalls = msg.tool_calls?.map<NonNullable<ChatMessage['toolCalls']>[number]>((tc) => {
      // The OpenAI SDK now allows custom tool types; our gateway only emits
      // function tools, so we narrow defensively.
      if (tc.type !== 'function') {
        throw new Error(`Unexpected tool call type from OpenAI: ${tc.type}`);
      }
      let args: Record<string, unknown>;
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (err) {
        // The model occasionally produces invalid JSON. We surface this as a
        // tool result error rather than crashing the chat turn.
        throw new Error(
          `Tool call '${tc.function.name}' had invalid JSON arguments: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return { id: tc.id, name: tc.function.name, args };
    });

    return {
      message: {
        role: 'assistant',
        content: msg.content ?? null,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      },
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
      finishReason: choice.finish_reason ?? 'unknown',
    };
  }

  async *chatMultiStream(
    params: MultiTurnStreamParams,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    // Map our messages to OpenAI's format. Streaming variant intentionally
    // doesn't take tools — the chat capability handles tool dispatch
    // synchronously and only streams the final text round.
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = params.messages.map((m) => {
      switch (m.role) {
        case 'system':
          return { role: 'system', content: m.content ?? '' };
        case 'user':
          return { role: 'user', content: m.content ?? '' };
        case 'assistant': {
          const msg: OpenAI.ChatCompletionAssistantMessageParam = {
            role: 'assistant',
            content: m.content,
          };
          if (m.toolCalls && m.toolCalls.length > 0) {
            msg.tool_calls = m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            }));
          }
          return msg;
        }
        case 'tool':
          if (!m.toolCallId) {
            throw new Error('Tool message missing toolCallId — cannot map to OpenAI format');
          }
          return { role: 'tool', tool_call_id: m.toolCallId, content: m.content ?? '' };
      }
    });

    const stream = await this.client.chat.completions.create({
      model: params.model,
      messages: openaiMessages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    });

    let fullContent = '';
    let model = params.model;
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = 'unknown';

    for await (const chunk of stream) {
      // The final chunk includes usage when stream_options.include_usage is on.
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
      if (chunk.model) model = chunk.model;

      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const delta = choice.delta?.content;
      if (delta) {
        fullContent += delta;
        yield { type: 'text-delta', content: delta };
      }
    }

    yield {
      type: 'done',
      message: { role: 'assistant', content: fullContent },
      usage: { inputTokens, outputTokens },
      model,
      finishReason,
    };
  }

  async imageEdit(params: ImageEditParams): Promise<ImageResponse> {
    // Uses the OpenAI Responses API with image_generation tool — matches the
    // current production app's enhance flow.
    // Cast to `unknown as never` because the OpenAI SDK's responses.create
    // types lag behind the actual API surface.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.client as any).responses.create({
      model: params.model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: params.sourceImageDataUrl, detail: 'auto' },
            { type: 'input_text', text: params.prompt },
          ],
        },
      ],
      tools: [
        {
          type: 'image_generation',
          model: params.imageModel,
          action: 'edit',
          quality: params.quality ?? 'medium',
          size: params.size,
          input_fidelity: params.inputFidelity ?? 'high',
        },
      ],
    });

    let pngBuffer: Buffer | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of response.output as any[]) {
      if (item.type === 'image_generation_call' && item.result) {
        pngBuffer = Buffer.from(item.result, 'base64');
        break;
      }
    }
    if (!pngBuffer) {
      throw new Error('No image returned by image_generation tool');
    }
    return { pngBuffer, imageCount: 1, model: params.imageModel };
  }
}
