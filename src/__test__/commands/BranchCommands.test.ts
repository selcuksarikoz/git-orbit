import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { BranchCommands } from '../../commands/BranchCommands';
import { GitService } from '../../services/GitService';
import { BranchTreeProvider } from '../../providers/BranchTreeProvider';

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    withProgress: vi.fn((options, task) => task()),
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      push: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      getBranches: vi.fn().mockResolvedValue({ current: 'main', local: [], remote: [] }),
      checkout: vi.fn().mockResolvedValue(undefined),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      deleteRemoteBranch: vi.fn().mockResolvedValue(undefined),
      findMainBranch: vi.fn().mockResolvedValue('main'),
      updateLocalBranchFromRemote: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('BranchCommands', () => {
  let branchCommands: BranchCommands;
  let mockGitService: any;
  let mockRefreshCallback: any;
  let mockLocalProvider: any;
  let mockRemoteProvider: any;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (BranchCommands as any).instance = undefined;
    mockGitService = GitService.getInstance();
    mockRefreshCallback = vi.fn();
    mockLocalProvider = { hideBranch: vi.fn() };
    mockRemoteProvider = { hideBranch: vi.fn() };
    mockContext = { subscriptions: [] };

    branchCommands = BranchCommands.getInstance(
      mockRefreshCallback,
      mockLocalProvider as any,
      mockRemoteProvider as any
    );

    branchCommands.register(mockContext);
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance2 = BranchCommands.getInstance();
      expect(branchCommands).toBe(instance2);
    });

    it('should throw if initialized without arguments first time', () => {
      (BranchCommands as any).instance = undefined;
      expect(() => BranchCommands.getInstance()).toThrow(
        'BranchCommands initialized without refresh callback'
      );
    });
  });

  describe('pushBranch', () => {
    it('should push branch and refresh', async () => {
      const item = { label: 'feat/test' };
      const pushFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.pushBranch'
      )?.[1];

      expect(pushFn).toBeDefined();
      await pushFn(item);

      expect(mockGitService.push).toHaveBeenCalledWith('origin', 'feat/test');
      expect(mockRefreshCallback).toHaveBeenCalled();
    });
  });

  describe('pullBranch', () => {
    it('should pull current branch', async () => {
      const item = { label: 'main' };
      mockGitService.getBranches.mockResolvedValue({
        current: 'main',
        local: [{ name: 'main' }],
        remote: [],
      });
      const pullFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.pullBranch'
      )?.[1];

      expect(pullFn).toBeDefined();
      await pullFn(item);

      expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'main');
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should update background branch from remote', async () => {
      const item = { label: 'develop' };
      mockGitService.getBranches.mockResolvedValue({
        current: 'main',
        local: [{ name: 'develop' }],
        remote: [],
      });
      const pullFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.pullBranch'
      )?.[1];

      expect(pullFn).toBeDefined();
      await pullFn(item);

      expect(mockGitService.updateLocalBranchFromRemote).toHaveBeenCalledWith('develop');
      expect(mockRefreshCallback).toHaveBeenCalled();
    });
  });

  describe('checkoutBranch', () => {
    it('should checkout branch and refresh', async () => {
      const item = { label: 'feat/test', repo: '/test' };
      const checkoutFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.checkoutBranch'
      )?.[1];

      expect(checkoutFn).toBeDefined();
      await checkoutFn(item);

      expect(mockGitService.checkout).toHaveBeenCalledWith('feat/test', '/test');
      expect(mockRefreshCallback).toHaveBeenCalled();
    });
  });

  describe('deleteBranch', () => {
    it('should delete branch after confirmation', async () => {
      const item = { label: 'feat/old', repo: '/test' };
      mockGitService.getBranches.mockResolvedValue({
        current: 'main',
        local: [{ name: 'feat/old' }],
        remote: [],
      });
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Delete' as any);

      const deleteFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.deleteBranch'
      )?.[1];

      expect(deleteFn).toBeDefined();
      await deleteFn(item);

      expect(mockGitService.deleteBranch).toHaveBeenCalledWith('feat/old', false, '/test');
      expect(mockLocalProvider.hideBranch).toHaveBeenCalledWith('feat/old', '/test');
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should switch to main if deleting current branch', async () => {
      const item = { label: 'main', repo: '/test' };
      mockGitService.getBranches.mockResolvedValue({
        current: 'main',
        local: [{ name: 'main' }],
        remote: [],
      });
      mockGitService.findMainBranch.mockResolvedValue('master');
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Delete' as any);

      const deleteFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.deleteBranch'
      )?.[1];

      expect(deleteFn).toBeDefined();
      await deleteFn(item);

      expect(mockGitService.checkout).toHaveBeenCalledWith('master', '/test');
      expect(mockGitService.deleteBranch).toHaveBeenCalledWith('main', false, '/test');
    });
  });

  describe('deleteBranchMenu', () => {
    it('should handle null item gracefully', async () => {
      const menuFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.deleteBranchMenu'
      )?.[1];

      expect(menuFn).toBeDefined();
      await menuFn(null);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'No branch selected for deletion.'
      );
    });
  });
});
