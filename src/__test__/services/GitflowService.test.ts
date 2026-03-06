import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GitflowService } from '../../services/GitflowService';
import { GitService } from '../../services/GitService';
import { ConfigService } from '../../services/ConfigService';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    withProgress: vi.fn((options, task) => task()),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getBranches: vi.fn().mockResolvedValue({ all: ['main', 'develop'], current: 'main' }),
      createBranch: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock ConfigService
vi.mock('../../services/ConfigService', () => ({
  ConfigService: {
    getInstance: vi.fn().mockReturnValue({
      featurePrefix: 'feature/',
      hotfixPrefix: 'hotfix/',
      bugfixPrefix: 'bugfix/',
      releasePrefix: 'release/',
      featureBase: 'develop',
      hotfixBase: 'main',
      bugfixBase: 'develop',
      releaseBase: 'main',
    }),
  },
}));

describe('GitflowService', () => {
  let gitflowService: GitflowService;
  let mockGitService: any;
  let mockConfigService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (GitflowService as any).instance = undefined;
    gitflowService = GitflowService.getInstance();
    mockGitService = GitService.getInstance();
    mockConfigService = ConfigService.getInstance();
  });

  it('should be a singleton', () => {
    const instance2 = GitflowService.getInstance();
    expect(gitflowService).toBe(instance2);
  });

  it('should start a branch', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue('develop' as any);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('my-feature' as any);

    await gitflowService.startBranch();

    expect(mockGitService.createBranch).toHaveBeenCalledWith('my-feature', 'develop');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Started branch: my-feature');
  });

  it('should start a gitflow branch (feature)', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('awesome-feature' as any);

    await gitflowService.startGitflowBranch('feature');

    expect(mockGitService.createBranch).toHaveBeenCalledWith('feature/awesome-feature', 'develop');
  });

  it('should start a remote branch', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue('develop' as any);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('remote-feature' as any);

    await gitflowService.startRemoteBranch();

    expect(mockGitService.push).toHaveBeenCalledWith('origin', 'develop:refs/heads/remote-feature');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Remote branch 'remote-feature' created successfully.");
  });

  it('should handle errors during branch creation', async () => {
    mockGitService.createBranch.mockRejectedValue(new Error('Branch exists'));
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue('develop' as any);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('existing-branch' as any);

    await gitflowService.startBranch();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Failed to create branch: Branch exists');
  });
});
