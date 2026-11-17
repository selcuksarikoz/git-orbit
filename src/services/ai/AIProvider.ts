/**
 * A single chat message exchanged with an AI provider.
 */
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Contract implemented by every AI backend. Credentials are managed through
 * the provider so callers never need to know where a key is persisted.
 */
export interface AIProvider {
  readonly id: string;
  readonly displayName: string;

  isConfigured(): Promise<boolean>;
  setApiKey(key: string): Promise<void>;
  clearApiKey(): Promise<void>;
  hasApiKey(): Promise<boolean>;

  streamChat(messages: AIMessage[], signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  generateCommitMessages(messages: AIMessage[]): Promise<string[]>;
}
