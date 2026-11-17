import * as vscode from 'vscode';
import { AIProvider } from './AIProvider';
import { OpenRouterProvider } from './OpenRouterProvider';

const DEFAULT_PROVIDER_ID = 'openrouter';

type ProviderFactory = (secrets: vscode.SecretStorage) => AIProvider;

/** Adding a backend only requires a new entry here; callers stay unchanged. */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  openrouter: (secrets) => new OpenRouterProvider(secrets),
};

export interface ProviderInfo {
  id: string;
  displayName: string;
  configured: boolean;
}

/** Fallback used when no SecretStorage is supplied (e.g. in unit tests). */
function createMemoryStorage(): vscode.SecretStorage {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key),
    store: async (key: string, value: string) => {
      values.set(key, value);
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as unknown as vscode.SecretStorage;
}

/**
 * Central registry of AI providers and their credentials.
 * Secrets are stored only via VS Code SecretStorage.
 */
export class AIProviderRegistry {
  private static instance: AIProviderRegistry | undefined;

  private readonly providers = new Map<string, AIProvider>();

  private constructor(secrets: vscode.SecretStorage) {
    for (const [id, factory] of Object.entries(PROVIDER_FACTORIES)) {
      this.providers.set(id, factory(secrets));
    }
  }

  public static getInstance(secrets?: vscode.SecretStorage): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry(secrets ?? createMemoryStorage());
    }
    return AIProviderRegistry.instance;
  }

  public async getProviders(): Promise<ProviderInfo[]> {
    const infos: ProviderInfo[] = [];
    for (const provider of this.providers.values()) {
      infos.push({
        id: provider.id,
        displayName: provider.displayName,
        configured: await provider.isConfigured(),
      });
    }
    return infos;
  }

  public async getActiveProvider(): Promise<AIProvider> {
    const id =
      vscode.workspace.getConfiguration('gitorbit.ai').get<string>('provider') ||
      DEFAULT_PROVIDER_ID;
    return this.requireProvider(id);
  }

  public async setActiveProvider(id: string): Promise<void> {
    this.requireProvider(id);
    await vscode.workspace
      .getConfiguration('gitorbit.ai')
      .update('provider', id, vscode.ConfigurationTarget.Global);
  }

  public async setApiKey(providerId: string, key: string): Promise<void> {
    await this.requireProvider(providerId).setApiKey(key);
  }

  public async clearApiKey(providerId: string): Promise<void> {
    await this.requireProvider(providerId).clearApiKey();
  }

  public async hasApiKey(providerId: string): Promise<boolean> {
    return this.requireProvider(providerId).hasApiKey();
  }

  private requireProvider(id: string): AIProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Unknown AI provider: ${id}`);
    }
    return provider;
  }
}
