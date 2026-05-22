import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  ChatParams,
  ChatResponse,
  VisionParams,
  MultiTurnParams,
  MultiTurnResponse,
  MultiTurnStreamParams,
  ChatMessage,
  StreamEvent,
  ToolCall,
} from '../types.js';

/**
 * Anthropic's tool name regex is `^[a-zA-Z0-9_-]{1,64}$` — no dots, same
 * shape as OpenAI's. Reuse the same encode/decode mapping so our dotted
 * capability namespace (`outfit.generate`) round-trips through tool calls.
 */
function encodeToolName(capabilityName: string): string {
  return capabilityName.replace(/\./g, '_');
}

function decodeToolName(toolName: string): string {
  return toolName.replace(/_/g, '.');
}

/**
 * Anthropic differs from OpenAI in three ways the adapter has to absorb:
 *   - System prompt is a top-level param, not a 'system' message role.
 *   - No 'tool' message role — tool results go into 'user' messages as
 *     `tool_result` content blocks.
 *   - Assistant messages carry `tool_use` content blocks (not a parallel
 *     `tool_calls` array); response content is an array of blocks (text
 *     plus tool_use), so we collect both passes.
 *
 * All conversion happens in toAnthropicMessages and the response mapping
 * inside chatMulti — the rest of the codebase keeps using our
 * provider-agnostic ChatMessage shape.
 */
export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
      temperature: params.temperature ?? 0.7,
    });

    return {
      content: extractText(response.content),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }

  async chatWithVision(params: VisionParams): Promise<ChatResponse> {
    const imageContent: Anthropic.ImageBlockParam[] = params.imageUrls.map((url) => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    }));

    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text' as const, text: params.userPrompt }, ...imageContent],
        },
      ],
      temperature: params.temperature ?? 0.7,
    });

    return {
      content: extractText(response.content),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }

  async chatMulti(params: MultiTurnParams): Promise<MultiTurnResponse> {
    const { system, messages } = this.toAnthropicMessages(params.messages);
    const tools: Anthropic.Tool[] | undefined = params.tools?.map((t) => ({
      name: encodeToolName(t.name),
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system,
      messages,
      tools,
      temperature: params.temperature ?? 0.7,
    });

    const textContent = extractText(response.content);

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const toolCalls: ToolCall[] | undefined =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map((b) => ({
            id: b.id,
            name: decodeToolName(b.name),
            args: (b.input ?? {}) as Record<string, unknown>,
          }))
        : undefined;

    return {
      message: {
        role: 'assistant',
        content: textContent.length > 0 ? textContent : null,
        toolCalls,
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
      finishReason: response.stop_reason ?? 'unknown',
    };
  }

  async *chatMultiStream(
    params: MultiTurnStreamParams,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const { system, messages } = this.toAnthropicMessages(params.messages);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let model = params.model;
    let finishReason = 'unknown';

    const stream = this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system,
      messages,
      temperature: params.temperature ?? 0.7,
    });

    for await (const event of stream) {
      if (event.type === 'message_start') {
        if (event.message.usage) {
          inputTokens = event.message.usage.input_tokens;
          outputTokens = event.message.usage.output_tokens;
        }
        if (event.message.model) {
          model = event.message.model;
        }
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullContent += event.delta.text;
        yield { type: 'text-delta', content: event.delta.text };
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          outputTokens = event.usage.output_tokens;
        }
        if (event.delta.stop_reason) {
          finishReason = event.delta.stop_reason;
        }
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

  /**
   * Convert our ChatMessage[] (OpenAI-shaped) to Anthropic's
   * (system + alternating user/assistant) format. Extracts the system
   * message and returns it separately. Tool-role messages become user
   * messages with tool_result content blocks.
   */
  private toAnthropicMessages(msgs: ChatMessage[]): {
    system: string;
    messages: Anthropic.MessageParam[];
  } {
    let system = '';
    const out: Anthropic.MessageParam[] = [];

    for (const m of msgs) {
      switch (m.role) {
        case 'system':
          system = m.content ?? '';
          break;
        case 'user':
          if (m.contentParts) {
            out.push({
              role: 'user',
              content: m.contentParts.map((p) =>
                p.type === 'text'
                  ? ({ type: 'text', text: p.text } as Anthropic.TextBlockParam)
                  : ({
                      type: 'image',
                      source: { type: 'url', url: p.image_url.url },
                    } as Anthropic.ImageBlockParam),
              ),
            });
          } else {
            out.push({ role: 'user', content: m.content ?? '' });
          }
          break;
        case 'assistant': {
          const content: Anthropic.ContentBlockParam[] = [];
          if (m.content) {
            content.push({ type: 'text', text: m.content });
          }
          if (m.toolCalls) {
            for (const tc of m.toolCalls) {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: encodeToolName(tc.name),
                input: tc.args,
              });
            }
          }
          // Anthropic rejects assistant messages with empty content.
          if (content.length === 0) {
            content.push({ type: 'text', text: '' });
          }
          out.push({ role: 'assistant', content });
          break;
        }
        case 'tool':
          if (!m.toolCallId) {
            throw new Error('Tool message missing toolCallId — cannot map to Anthropic format');
          }
          out.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: m.toolCallId,
                content: m.content ?? '',
              },
            ],
          });
          break;
      }
    }

    return { system, messages: out };
  }
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}
