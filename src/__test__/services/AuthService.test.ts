import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../services/AuthService';
import * as vscode from 'vscode';

// Mock vscode
vi.mock('vscode', () => ({
  ConfigurationTarget: {
    Global: 1,
  },
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    }),
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('AuthService', () => {
  let authService: AuthService;
  let mockSecretStorage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (AuthService as any).instance = undefined;
    authService = AuthService.getInstance();
    
    mockSecretStorage = {
      get: vi.fn(),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const mockContext = {
      secrets: mockSecretStorage,
    } as any;

    authService.init(mockContext);
  });

  it('should be a singleton', () => {
    const instance2 = AuthService.getInstance();
    expect(authService).toBe(instance2);
  });

  it('should store tokens', async () => {
    await authService.storeTokens('access', 'refresh');
    
    expect(mockSecretStorage.store).toHaveBeenCalledWith('gitorbit.token', 'access');
    expect(mockSecretStorage.store).toHaveBeenCalledWith('gitorbit.refresh_token', 'refresh');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'gitorbit.isLoggedIn', true);
  });

  it('should get access token', async () => {
    mockSecretStorage.get.mockResolvedValue('access');
    
    const token = await authService.getAccessToken();
    expect(token).toBe('access');
    expect(mockSecretStorage.get).toHaveBeenCalledWith('gitorbit.token');
  });

  it('should logout', async () => {
    await authService.logout();
    
    expect(mockSecretStorage.delete).toHaveBeenCalledWith('gitorbit.token');
    expect(mockSecretStorage.delete).toHaveBeenCalledWith('gitorbit.refresh_token');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'gitorbit.isLoggedIn', false);
  });

  it('should return true for isLoggedIn when token exists', async () => {
    mockSecretStorage.get.mockResolvedValue('access');
    const loggedIn = await authService.isLoggedIn();
    expect(loggedIn).toBe(true);
  });

  it('should return false for isLoggedIn when token does not exist', async () => {
    mockSecretStorage.get.mockResolvedValue(undefined);
    const loggedIn = await authService.isLoggedIn();
    expect(loggedIn).toBe(false);
  });
});
