import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { WorktreeService } from '../../services/WorktreeService';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    withProgress: vi.fn((options, task) => task()),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getDefaultRepository: vi.fn().mockReturnValue({
        rootDir: '/test/repo',
        executor: {
          exec: vi.fn(),
        },
      }),
      getBranches: vi.fn().mockResolvedValue({ all: ['main', 'feature1'], current: 'main' }),
    }),
  },
}));

describe('WorktreeService', () => {
  let worktreeService: WorktreeService;
  let mockGitService: any;
  let mockExecutor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (WorktreeService as any).instance = undefined;
    worktreeService = WorktreeService.getInstance();
    mockGitService = GitService.getInstance();
    mockExecutor = mockGitService.getDefaultRepository().executor;
  });

  it('should be a singleton', () => {
    const instance2 = WorktreeService.getInstance();
    expect(worktreeService).toBe(instance2);
  });

  it('should list worktrees', async () => {
    mockExecutor.exec.mockResolvedValue({
      stdout: 'worktree /test/repo\nHEAD abcdef1\nbranch refs/heads/main\n\nworktree /test/wt1\nHEAD 1234567\nbranch refs/heads/feature1\n\n',
      stderr: '',
      exitCode: 0,
    });

    const worktrees = await worktreeService.listWorktrees();

    expect(worktrees.length).toBe(2);
    expect(worktrees[0].path).toBe('/test/repo');
    expect(worktrees[1].path).toBe('/test/wt1');
    expect(worktrees[1].branch).toBe('refs/heads/feature1');
  });

  it('should add a worktree', async () => {
    mockExecutor.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const success = await worktreeService.addWorktree('/test/wt2', 'feature2', true);

    expect(success).toBe(true);
    expect(mockExecutor.exec).toHaveBeenCalledWith(['worktree', 'add', '-b', 'feature2', '/test/wt2']);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Worktree created at'));
  });

  it('should remove a worktree', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Yes' as any);
    mockExecutor.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const success = await worktreeService.removeWorktree('/test/wt1');

    expect(success).toBe(true);
    expect(mockExecutor.exec).toHaveBeenCalledWith(['worktree', 'remove', '/test/wt1']);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Worktree removed successfully');
  });

  it('should prune worktrees', async () => {
    mockExecutor.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const success = await worktreeService.pruneWorktrees();

    expect(success).toBe(true);
    expect(mockExecutor.exec).toHaveBeenCalledWith(['worktree', 'prune']);
  });

  it('should lock a worktree', async () => {
    mockExecutor.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const success = await worktreeService.lockWorktree('/test/wt1', 'test reason');

    expect(success).toBe(true);
    expect(mockExecutor.exec).toHaveBeenCalledWith(['worktree', 'lock', '/test/wt1', '-m', 'test reason']);
  });
});
