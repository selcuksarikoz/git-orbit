import * as vscode from 'vscode';
import { AIProvider, AIMessage } from './AIProvider';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const HTTP_REFERER = 'https://github.com/git-orbit/git-orbit';
const X_TITLE = 'Git Orbit';

interface OpenRouterPayload {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
  }>;
  error?: string | { message?: string };
}

/**
 * OpenRouter implementation of the AI provider contract.
 * The API key lives only in VS Code SecretStorage, never in configuration.
 */
export class OpenRouterProvider implements AIProvider {
  public readonly id = 'openrouter';
  public readonly displayName = 'OpenRouter';

  private readonly secrets: vscode.SecretStorage;

  public constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  private get secretKey(): string {
    return `gitorbit.ai.${this.id}.apiKey`;
  }

  private get model(): string {
    return (
      vscode.workspace.getConfiguration('gitorbit.ai.openrouter').get<string>('model') ||
      DEFAULT_MODEL
    );
  }

  private async getApiKey(): Promise<string | undefined> {
    return this.secrets.get(this.secretKey);
  }

  private async requireApiKey(): Promise<string> {
    const key = await this.getApiKey();
    if (!key) {
      throw new Error(
        'No OpenRouter API key is set. Run "GitOrbit: Set AI Provider API Key..." to add one.'
      );
    }
    return key;
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': HTTP_REFERER,
      'X-Title': X_TITLE,
    };
  }

  private errorMessage(error: OpenRouterPayload['error']): string {
    if (typeof error === 'string') {
      return error;
    }
    return error?.message || 'Unknown OpenRouter API error';
  }

  private createAbortError(): Error {
    const error = new Error('OpenRouter stream aborted');
    error.name = 'AbortError';
    return error;
  }

  public async isConfigured(): Promise<boolean> {
    return this.hasApiKey();
  }

  public async setApiKey(key: string): Promise<void> {
    await this.secrets.store(this.secretKey, key);
  }

  public async clearApiKey(): Promise<void> {
    await this.secrets.delete(this.secretKey);
  }

  public async hasApiKey(): Promise<boolean> {
    return Boolean(await this.getApiKey());
  }

  /**
   * Streams a chat completion as a byte stream of decoded text deltas.
   */
  public async streamChat(
    messages: AIMessage[],
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const apiKey = await this.requireApiKey();

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API request failed: ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error('OpenRouter API response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';

    const onAbort = (): void => {
      void reader.cancel();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        const pump = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                cleanup();
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line.startsWith('data:')) {
                  continue;
                }

                const payload = line.slice('data:'.length).trim();
                if (payload === '[DONE]') {
                  controller.close();
                  cleanup();
                  return;
                }

                let parsed: OpenRouterPayload;
                try {
                  parsed = JSON.parse(payload) as OpenRouterPayload;
                } catch {
                  // Ignore malformed or partial SSE fragments.
                  continue;
                }

                if (parsed.error) {
                  controller.error(new Error(this.errorMessage(parsed.error)));
                  cleanup();
                  return;
                }

                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              }
            }
          } catch (error) {
            cleanup();
            if (signal?.aborted) {
              controller.error(this.createAbortError());
              return;
            }
            controller.error(error);
          }
        };
        void pump();
      },
      cancel: async () => {
        cleanup();
        await reader.cancel();
      },
    });
  }

  /**
   * Performs a non-streaming completion and returns cleaned commit messages.
   */
  public async generateCommitMessages(messages: AIMessage[]): Promise<string[]> {
    const apiKey = await this.requireApiKey();

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OpenRouterPayload;
    if (data.error) {
      throw new Error(this.errorMessage(data.error));
    }

    const text = (data.choices?.[0]?.message?.content || '').trim();

    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => line.replace(/^[\d\-\*\.]+\s*/, '').replace(/^[`"']|[`"']$/g, ''))
      .filter((line) => line.length > 0);
  }
}
