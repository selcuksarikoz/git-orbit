import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService, Message } from '../../services/AIService';
import { AIProviderRegistry } from '../../services/ai/AIProviderRegistry';

vi.mock('../../services/ai/AIProviderRegistry', () => ({
  AIProviderRegistry: {
    getInstance: vi.fn(),
  },
}));

describe('AIService', () => {
  let aiService: AIService;
  let provider: {
    id: string;
    isConfigured: ReturnType<typeof vi.fn>;
    streamChat: ReturnType<typeof vi.fn>;
    generateCommitMessages: ReturnType<typeof vi.fn>;
  };
  let registry: { getActiveProvider: ReturnType<typeof vi.fn> };
  const messages: Message[] = [{ role: 'user', content: 'hello' }];

  beforeEach(() => {
    vi.clearAllMocks();
    (AIService as unknown as { instance: undefined }).instance = undefined;

    provider = {
      id: 'openrouter',
      isConfigured: vi.fn().mockResolvedValue(true),
      streamChat: vi.fn().mockResolvedValue(new ReadableStream<Uint8Array>()),
      generateCommitMessages: vi.fn().mockResolvedValue(['feat: test']),
    };
    registry = { getActiveProvider: vi.fn().mockResolvedValue(provider) };
    vi.mocked(AIProviderRegistry.getInstance).mockReturnValue(
      registry as unknown as AIProviderRegistry
    );

    aiService = AIService.getInstance();
  });

  it('is a singleton', () => {
    expect(aiService).toBe(AIService.getInstance());
  });

  it('delegates streamChat to the active provider with the abort signal', async () => {
    const controller = new AbortController();
    const stream = await aiService.streamChat(messages, controller.signal);
    expect(registry.getActiveProvider).toHaveBeenCalled();
    expect(provider.streamChat).toHaveBeenCalledWith(messages, controller.signal);
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it('delegates generateCommitMessages to the active provider', async () => {
    const result = await aiService.generateCommitMessages(messages);
    expect(provider.generateCommitMessages).toHaveBeenCalledWith(messages);
    expect(result).toEqual(['feat: test']);
  });

  it('validateConfig is async and reflects the provider configuration', async () => {
    const result = aiService.validateConfig();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(true);
    expect(provider.isConfigured).toHaveBeenCalled();
  });

  it('validateConfig resolves false when the provider is unconfigured', async () => {
    provider.isConfigured.mockResolvedValue(false);
    await expect(aiService.validateConfig()).resolves.toBe(false);
  });

  it('propagates provider errors', async () => {
    provider.generateCommitMessages.mockRejectedValue(new Error('provider failed'));
    await expect(aiService.generateCommitMessages(messages)).rejects.toThrow('provider failed');
  });
});
