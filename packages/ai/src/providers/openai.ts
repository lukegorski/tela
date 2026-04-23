import OpenAI from 'openai';
import type {
  AIProvider,
  ChatParams,
  ChatResponse,
  VisionParams,
  ImageEditParams,
  ImageResponse,
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
