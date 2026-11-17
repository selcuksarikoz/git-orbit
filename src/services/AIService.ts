import { AIMessage } from './ai/AIProvider';
import { AIProviderRegistry } from './ai/AIProviderRegistry';

/** Backwards-compatible alias for the provider-agnostic message shape. */
export type Message = AIMessage;

/**
 * Thin facade kept for existing callers. All behavior is delegated to the
 * currently active provider from the registry.
 */
export class AIService {
  private static instance: AIService;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  private get registry(): AIProviderRegistry {
    return AIProviderRegistry.getInstance();
  }

  public async streamChat(
    messages: Message[],
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const provider = await this.registry.getActiveProvider();
    return provider.streamChat(messages, abortSignal);
  }

  public async validateConfig(): Promise<boolean> {
    const provider = await this.registry.getActiveProvider();
    return provider.isConfigured();
  }

  public async generateCommitMessages(messages: Message[]): Promise<string[]> {
    const provider = await this.registry.getActiveProvider();
    return provider.generateCommitMessages(messages);
  }
}
