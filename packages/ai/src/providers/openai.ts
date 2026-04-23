import OpenAI from 'openai';
import type { AIProvider, ChatParams, ChatResponse, VisionParams } from '../types.js';

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
}
