import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { BlameCommands } from '../../commands/BlameCommands';
import { GitService } from '../../services/GitService';

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    executeCommand: vi.fn(),
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    activeTextEditor: {
      document: { uri: { fsPath: '/test/file.ts' } },
      viewColumn: 1,
    },
    showTextDocument: vi.fn(),
  },
  env: {
    clipboard: {
      writeText: vi.fn(),
    },
    openExternal: vi.fn(),
  },
  Uri: {
    parse: vi.fn((url) => ({ fsPath: url, scheme: 'https' })),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getRemoteUrl: vi.fn(),
      getRepositoryForPath: vi.fn(),
      getRelativePath: vi.fn(),
      getFileHistory: vi.fn(),
    }),
  },
}));

describe('BlameCommands', () => {
  let blameCommands: BlameCommands;
  let mockContext: any;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = { subscriptions: [] };
    mockGitService = GitService.getInstance();
    blameCommands = new BlameCommands(mockContext);
  });

  describe('constructor', () => {
    it('should register all blame commands', () => {
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.copyCommitHash',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.openCommitOnWeb',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.viewCommitDiff',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.showLineHistory',
        expect.any(Function)
      );
      expect(mockContext.subscriptions.length).toBe(4);
    });
  });

  describe('copyCommitHash', () => {
    it('should copy hash to clipboard', async () => {
      const hash = 'abc123456789';
      const copyHashFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copyCommitHash'
      )[1];

      await copyHashFn(hash);

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(hash);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('abc1234')
      );
    });

    it('should show error message on failure', async () => {
      vi.mocked(vscode.env.clipboard.writeText).mockRejectedValue(new Error('Failed'));
      const copyHashFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copyCommitHash'
      )[1];

      await copyHashFn('abc');

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to copy commit hash')
      );
    });
  });

  describe('openCommitOnWeb', () => {
    it('should open commit on GitHub', async () => {
      mockGitService.getRemoteUrl.mockResolvedValue('https://github.com/user/repo.git');
      const openWebFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.openCommitOnWeb'
      )[1];

      await openWebFn('abc123');

      expect(vscode.env.openExternal).toHaveBeenCalled();
      const uri = vi.mocked(vscode.Uri.parse).mock.calls[0][0];
      expect(uri).toBe('https://github.com/user/repo/commit/abc123');
    });

    it('should handle SSH URLs', async () => {
      mockGitService.getRemoteUrl.mockResolvedValue('git@github.com:user/repo.git');
      const openWebFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.openCommitOnWeb'
      )[1];

      await openWebFn('abc123');

      const uri = vi.mocked(vscode.Uri.parse).mock.calls[0][0];
      expect(uri).toBe('https://github.com/user/repo/commit/abc123');
    });

    it('should show warning if no remote URL', async () => {
      mockGitService.getRemoteUrl.mockResolvedValue(null);
      const openWebFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.openCommitOnWeb'
      )[1];

      await openWebFn('abc123');

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No remote repository found');
    });
  });

  describe('viewCommitDiff', () => {
    it('should execute gitorbit.openCommitDiffs', async () => {
      const viewDiffFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.viewCommitDiff'
      )[1];

      await viewDiffFn('abc123');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('gitorbit.openCommitDiffs', {
        hash: 'abc123',
      });
    });
  });

  describe('showLineHistory', () => {
    it('should show quick pick with file history', async () => {
      const history = {
        all: [
          { hash: 'abc123', message: 'feat: test', author_name: 'John', date: '2023-01-01' },
        ],
      };
      mockGitService.getFileHistory.mockResolvedValue(history);
      mockGitService.getRepositoryForPath.mockReturnValue({ rootDir: '/test' });
      mockGitService.getRelativePath.mockReturnValue('file.ts');
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        hash: 'abc123',
        repoRoot: '/test',
      } as any);

      const showHistoryFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.showLineHistory'
      )[1];

      await showHistoryFn({ file: '/test/file.ts', line: 10 });

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('gitorbit.openCommitDiffs', {
        hash: 'abc123',
        repoRoot: '/test',
      });
    });

    it('should show info message if no history found', async () => {
      mockGitService.getFileHistory.mockResolvedValue({ all: [] });
      const showHistoryFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.showLineHistory'
      )[1];

      await showHistoryFn({ file: '/test/file.ts', line: 10 });

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'No history found for this file'
      );
    });
  });
});
