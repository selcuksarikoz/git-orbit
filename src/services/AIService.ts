import * as vscode from 'vscode';
import { AuthService } from './AuthService';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class AIService {
  private static instance: AIService;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  private get apiUrl() {
    // return 'https://kuulto.app/api/chat/git';
    return 'http://localhost:3000/api/chat/git';
  }

  private async ensureAuthenticatedToken(): Promise<string> {
    const token = await AuthService.getInstance().getAccessToken();

    if (!token) {
      vscode.window
        .showErrorMessage(
          'Please sign in to your Kuulto AI account to continue using this feature.',
          'Sign In'
        )
        .then((selection) => {
          if (selection === 'Sign In') {
            vscode.commands.executeCommand('gitorbit.login');
          }
        });
      throw new Error('Unauthorized: Authentication required.');
    }
    return token;
  }

  /**
   * Streams chat completion from the centralized API.
   */
  public async streamChat(messages: Message[], abortSignal?: AbortSignal) {
    const token = await this.ensureAuthenticatedToken();

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': process.env.X_API_KEY!,
      },
      body: JSON.stringify({ messages, stream: true, type: 'chat' }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    return response.body;
  }

  public validateConfig(): boolean {
    return true;
  }

  public async generateCommitMessages(messages: Message[]): Promise<string[]> {
    const token = await this.ensureAuthenticatedToken();

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-api-key': process.env.X_API_KEY!,
        },
        body: JSON.stringify({
          messages,
          stream: false,
          type: 'commit-message',
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.text || '';

      return text
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0 && !line.startsWith('#'))
        .map((line: string) => line.replace(/^[\d\-\*\.]+\s*/, '').replace(/^[`"']|[`"']$/g, '')) // Remove leading numbering/bullets/quotes
        .filter((line: string) => line.length > 0);
    } catch (error: any) {
      console.error('AI Generation failed:', error);
      throw new Error(`AI Generation failed: ${error.message}`);
    }
  }
}
