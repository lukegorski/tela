import type { AIProvider, ChatParams, ChatResponse, VisionParams } from '../types.js';

type MockHandler = (params: ChatParams | VisionParams) => ChatResponse;

/**
 * Mock AI provider for testing.
 * Register handlers by operation pattern or return a default response.
 */
export class MockProvider implements AIProvider {
  private handlers: Map<string, MockHandler> = new Map();
  private defaultResponse: ChatResponse = {
    content: '{}',
    usage: { inputTokens: 100, outputTokens: 50 },
    model: 'mock-model',
  };
  public calls: Array<{ method: string; params: ChatParams | VisionParams }> = [];

  /**
   * Register a mock handler that matches when the user prompt contains the given pattern.
   */
  onPromptContaining(pattern: string, handler: MockHandler): this {
    this.handlers.set(pattern, handler);
    return this;
  }

  setDefaultResponse(response: ChatResponse): this {
    this.defaultResponse = response;
    return this;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    this.calls.push({ method: 'chat', params });
    return this.resolve(params);
  }

  async chatWithVision(params: VisionParams): Promise<ChatResponse> {
    this.calls.push({ method: 'chatWithVision', params });
    return this.resolve(params);
  }

  private resolve(params: ChatParams | VisionParams): ChatResponse {
    for (const [pattern, handler] of this.handlers) {
      if (params.userPrompt.includes(pattern) || params.systemPrompt.includes(pattern)) {
        return handler(params);
      }
    }
    return this.defaultResponse;
  }

  reset(): void {
    this.calls = [];
    this.handlers.clear();
  }
}
