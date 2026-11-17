import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { AIProviderRegistry } from '../../../services/ai/AIProviderRegistry';
import { OpenRouterProvider } from '../../../services/ai/OpenRouterProvider';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
  ConfigurationTarget: {
    Global: 1,
  },
}));

function mockSecrets(): vscode.SecretStorage {
  const values = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => values.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  } as unknown as vscode.SecretStorage;
}

describe('AIProviderRegistry', () => {
  let secrets: vscode.SecretStorage;
  let config: { get: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    (AIProviderRegistry as unknown as { instance: undefined }).instance = undefined;

    secrets = mockSecrets();
    config = {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };
    (vscode.workspace.getConfiguration as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      config
    );
  });

  it('is a singleton', () => {
    const registry = AIProviderRegistry.getInstance(secrets);
    expect(AIProviderRegistry.getInstance()).toBe(registry);
  });

  it('falls back to an in-memory store when no secrets are provided', async () => {
    const registry = AIProviderRegistry.getInstance();
    await registry.setApiKey('openrouter', 'sk-local');
    expect(await registry.hasApiKey('openrouter')).toBe(true);
    await registry.clearApiKey('openrouter');
    expect(await registry.hasApiKey('openrouter')).toBe(false);
  });

  it('lists known providers with configured flags', async () => {
    const registry = AIProviderRegistry.getInstance(secrets);
    expect(await registry.getProviders()).toEqual([
      { id: 'openrouter', displayName: 'OpenRouter', configured: false },
    ]);

    await registry.setApiKey('openrouter', 'sk-test');
    expect(await registry.getProviders()).toEqual([
      { id: 'openrouter', displayName: 'OpenRouter', configured: true },
    ]);
  });

  it('returns the openrouter provider by default', async () => {
    const registry = AIProviderRegistry.getInstance(secrets);
    const provider = await registry.getActiveProvider();
    expect(provider).toBeInstanceOf(OpenRouterProvider);
    expect(provider.id).toBe('openrouter');
  });

  it('reads the active provider from configuration', async () => {
    config.get.mockImplementation((key: string) => (key === 'provider' ? 'openrouter' : undefined));
    const registry = AIProviderRegistry.getInstance(secrets);
    expect((await registry.getActiveProvider()).id).toBe('openrouter');
    expect(config.get).toHaveBeenCalledWith('provider');
  });

  it('validates and stores the active provider globally', async () => {
    const registry = AIProviderRegistry.getInstance(secrets);
    await registry.setActiveProvider('openrouter');
    expect(config.update).toHaveBeenCalledWith(
      'provider',
      'openrouter',
      vscode.ConfigurationTarget.Global
    );
    await expect(registry.setActiveProvider('unknown')).rejects.toThrow(/Unknown AI provider/);
  });

  it('delegates key management to the provider via SecretStorage', async () => {
    const registry = AIProviderRegistry.getInstance(secrets);
    await registry.setApiKey('openrouter', 'sk-secret');
    expect(secrets.store).toHaveBeenCalledWith('gitorbit.ai.openrouter.apiKey', 'sk-secret');

    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-secret');
    expect(await registry.hasApiKey('openrouter')).toBe(true);

    await registry.clearApiKey('openrouter');
    expect(secrets.delete).toHaveBeenCalledWith('gitorbit.ai.openrouter.apiKey');
  });

  it('rejects unknown provider ids for key operations', async () => {
    const registry = AIProviderRegistry.getInstance(secrets);
    await expect(registry.setApiKey('nope', 'x')).rejects.toThrow(/Unknown AI provider/);
    await expect(registry.clearApiKey('nope')).rejects.toThrow(/Unknown AI provider/);
    await expect(registry.hasApiKey('nope')).rejects.toThrow(/Unknown AI provider/);
  });
});
