import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../../services/AIService';
import { AuthService } from '../../services/AuthService';
import * as vscode from 'vscode';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

// Mock AuthService
vi.mock('../../services/AuthService', () => ({
  AuthService: {
    getInstance: vi.fn().mockReturnValue({
      getAccessToken: vi.fn(),
      refreshAccessToken: vi.fn(),
    }),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('AIService', () => {
  let aiService: AIService;
  let authService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (AIService as any).instance = undefined;
    aiService = AIService.getInstance();
    authService = AuthService.getInstance();
    
    // Set environment variables for tests
    process.env.DOMAIN_URL = 'https://api.test.com';
    process.env.X_API_KEY = 'test-api-key';
  });

  it('should be a singleton', () => {
    const instance2 = AIService.getInstance();
    expect(aiService).toBe(instance2);
  });

  it('should generate commit messages', async () => {
    authService.getAccessToken.mockResolvedValue('test-token');
    
    const mockResponse = {
      ok: true,
      json: async () => ({ text: '1. feat: initial commit\n2. fix: bugs' }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages = [{ role: 'user' as const, content: 'test' }];
    const result = await aiService.generateCommitMessages(messages);

    expect(result).toEqual(['feat: initial commit', 'fix: bugs']);
    expect(fetch).toHaveBeenCalledWith('https://api.test.com', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer test-token',
      }),
    }));
  });

  it('should throw error if not authenticated', async () => {
    authService.getAccessToken.mockResolvedValue(null);
    
    const messages = [{ role: 'user' as const, content: 'test' }];
    await expect(aiService.generateCommitMessages(messages)).rejects.toThrow('Unauthorized: Authentication required.');
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('should throw error if API fails', async () => {
    authService.getAccessToken.mockResolvedValue('test-token');
    
    const mockResponse = {
      ok: false,
      statusText: 'Bad Request',
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages = [{ role: 'user' as const, content: 'test' }];
    await expect(aiService.generateCommitMessages(messages)).rejects.toThrow('API request failed: Bad Request');
  });
});
