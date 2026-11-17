import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { OpenRouterProvider } from '../../../services/ai/OpenRouterProvider';
import { AIMessage } from '../../../services/ai/AIProvider';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
}));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sseChunks(chunks: unknown[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function delta(content: string): unknown {
  return { choices: [{ delta: { content } }] };
}

/** Reads a byte stream fully into a string. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

function mockSecrets(): vscode.SecretStorage {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    store: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as vscode.SecretStorage;
}

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;
  let secrets: vscode.SecretStorage;
  let configGet: ReturnType<typeof vi.fn>;
  const messages: AIMessage[] = [{ role: 'user', content: 'hello' }];

  beforeEach(() => {
    vi.clearAllMocks();
    secrets = mockSecrets();
    provider = new OpenRouterProvider(secrets);

    configGet = vi
      .fn()
      .mockImplementation((key: string) => (key === 'model' ? 'openai/gpt-4o-mini' : undefined));
    (vscode.workspace.getConfiguration as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      get: configGet,
    });
    global.fetch = vi.fn();
  });

  it('exposes its identity', () => {
    expect(provider.id).toBe('openrouter');
    expect(provider.displayName).toBe('OpenRouter');
  });

  it('stores, checks and clears the key in SecretStorage', async () => {
    await provider.setApiKey('sk-test');
    expect(secrets.store).toHaveBeenCalledWith('gitorbit.ai.openrouter.apiKey', 'sk-test');

    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    expect(await provider.hasApiKey()).toBe(true);
    expect(await provider.isConfigured()).toBe(true);

    await provider.clearApiKey();
    expect(secrets.delete).toHaveBeenCalledWith('gitorbit.ai.openrouter.apiKey');
  });

  it('throws when no API key is set', async () => {
    await expect(provider.generateCommitMessages(messages)).rejects.toThrow(
      /No OpenRouter API key/
    );
    await expect(provider.streamChat(messages)).rejects.toThrow(/No OpenRouter API key/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('streams SSE deltas as decoded text and closes on [DONE]', async () => {
    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: sseChunks([delta('Hello '), delta('world')]),
    } as unknown as Response);

    const stream = await provider.streamChat(messages);
    expect(await readAll(stream)).toBe('Hello world');

    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'HTTP-Referer': expect.any(String),
          'X-Title': 'Git Orbit',
        }),
        body: expect.stringContaining('"stream":true'),
      })
    );
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('openai/gpt-4o-mini');
  });

  it('uses the configured model', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'model' ? 'anthropic/claude' : undefined
    );
    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: sseChunks([delta('ok')]),
    } as unknown as Response);

    await readAll(await provider.streamChat(messages));
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('anthropic/claude');
  });

  it('surfaces SSE error payloads as errors', async () => {
    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: sseChunks([{ error: { message: 'Rate limited' } }]),
    } as unknown as Response);

    const reader = (await provider.streamChat(messages)).getReader();
    await expect(reader.read()).rejects.toThrow('Rate limited');
  });

  it('throws for non-2xx responses', async () => {
    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as unknown as Response);

    await expect(provider.streamChat(messages)).rejects.toThrow(/401 Unauthorized/);
    await expect(provider.generateCommitMessages(messages)).rejects.toThrow(/401 Unauthorized/);
  });

  it('honors AbortSignal by cancelling the underlying reader', async () => {
    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(delta('Hi'))}\n\n`));
      },
      cancel,
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true, body } as unknown as Response);

    const controller = new AbortController();
    const reader = (await provider.streamChat(messages, controller.signal)).getReader();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain('Hi');

    controller.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalled();
  });

  it('generates cleaned commit messages', async () => {
    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '1. feat: initial commit\n2. `fix: bugs`\n# a comment\n* docs: readme\n\n   ',
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await provider.generateCommitMessages(messages);
    expect(result).toEqual(['feat: initial commit', 'fix: bugs', 'docs: readme']);
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(false);
  });

  it('surfaces generateCommitMessages error payloads', async () => {
    (secrets.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'Bad model' } }),
    } as unknown as Response);

    await expect(provider.generateCommitMessages(messages)).rejects.toThrow('Bad model');
  });
});
