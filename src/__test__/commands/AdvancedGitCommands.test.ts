vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInputBox: vi.fn(),
  },
  ExtensionContext: class MockExtensionContext {
    subscriptions: any[] = [];
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      mergeBranch: vi.fn().mockResolvedValue(undefined),
      rebaseContinue: vi.fn().mockResolvedValue(undefined),
      rebaseSkip: vi.fn().mockResolvedValue(undefined),
      cherryPickContinue: vi.fn().mockResolvedValue(undefined),
      cherryPickAbort: vi.fn().mockResolvedValue(undefined),
      createTag: vi.fn().mockResolvedValue(undefined),
      deleteTag: vi.fn().mockResolvedValue(undefined),
      pushTag: vi.fn().mockResolvedValue(undefined),
      fetchRemote: vi.fn().mockResolvedValue(undefined),
      getRepositoryByRoot: vi.fn(),
    }),
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { AdvancedGitCommands } from '../../commands/AdvancedGitCommands';
import { GitService } from '../../services/GitService';

const COMMAND_IDS = [
  'gitorbit.git.merge',
  'gitorbit.git.rebaseContinue',
  'gitorbit.git.rebaseSkip',
  'gitorbit.git.cherryPickContinue',
  'gitorbit.git.cherryPickAbort',
  'gitorbit.git.tagCreate',
  'gitorbit.git.tagDelete',
  'gitorbit.git.tagPush',
  'gitorbit.git.fetch',
];

describe('AdvancedGitCommands', () => {
  let commands: AdvancedGitCommands;
  let mockGitService: any;
  let refresh: ReturnType<typeof vi.fn>;
  let registered: boolean;

  function getHandler(id: string): (...args: any[]) => Promise<void> {
    if (!registered) {
      commands.register(new vscode.ExtensionContext());
      registered = true;
    }
    const call = (vscode.commands.registerCommand as any).mock.calls.find(
      (c: any[]) => c[0] === id
    );
    return call?.[1];
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    (AdvancedGitCommands as any).instance = undefined;
    registered = false;
    refresh = vi.fn();
    commands = AdvancedGitCommands.getInstance(refresh);
    const { GitService } = await import('../../services/GitService');
    mockGitService = GitService.getInstance() as any;
  });

  afterEach(() => {
    (AdvancedGitCommands as any).instance = undefined;
  });

  describe('getInstance and register', () => {
    it('returns the singleton instance', () => {
      expect(AdvancedGitCommands.getInstance()).toBe(commands);
    });

    it('registers all advanced command ids', () => {
      const context = new vscode.ExtensionContext();
      commands.register(context);

      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(COMMAND_IDS.length);
      COMMAND_IDS.forEach((id) => {
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(id, expect.any(Function));
      });
      expect(context.subscriptions.length).toBe(COMMAND_IDS.length);
    });
  });

  describe('merge', () => {
    it('merges a branch name given as a string', async () => {
      await getHandler('gitorbit.git.merge')('feature/x');
      expect(mockGitService.mergeBranch).toHaveBeenCalledWith('feature/x', undefined);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('uses the branch and repo from a tree item', async () => {
      const repo = { rootDir: '/repo' };
      await getHandler('gitorbit.git.merge')({ branchName: 'develop', repo });
      expect(mockGitService.mergeBranch).toHaveBeenCalledWith('develop', repo);
    });

    it('reports an error and does not refresh when the merge fails', async () => {
      mockGitService.mergeBranch.mockRejectedValueOnce(new Error('merge conflict'));
      await getHandler('gitorbit.git.merge')('feature/x');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('merge conflict')
      );
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  it('delegates rebase and cherry-pick continuations with the item repo', async () => {
    const repo = { rootDir: '/repo' };
    await getHandler('gitorbit.git.rebaseContinue')({ repo });
    await getHandler('gitorbit.git.rebaseSkip')({ repo });
    await getHandler('gitorbit.git.cherryPickContinue')({ repo });
    await getHandler('gitorbit.git.cherryPickAbort')({ repo });

    expect(mockGitService.rebaseContinue).toHaveBeenCalledWith(repo);
    expect(mockGitService.rebaseSkip).toHaveBeenCalledWith(repo);
    expect(mockGitService.cherryPickContinue).toHaveBeenCalledWith(repo);
    expect(mockGitService.cherryPickAbort).toHaveBeenCalledWith(repo);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  describe('tags', () => {
    it('creates a tag with the input name and item hash', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('v2.0.0');
      const repo = { rootDir: '/repo' };
      await getHandler('gitorbit.git.tagCreate')({ hash: 'abc123', repo });

      expect(mockGitService.createTag).toHaveBeenCalledWith('v2.0.0', 'abc123', repo);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does nothing when tag creation is cancelled', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
      await getHandler('gitorbit.git.tagCreate')();

      expect(mockGitService.createTag).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('deletes a tag after confirmation', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Delete');
      await getHandler('gitorbit.git.tagDelete')({ label: 'v1.0.0' });

      expect(mockGitService.deleteTag).toHaveBeenCalledWith('v1.0.0', undefined);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not delete a tag when confirmation is cancelled', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Cancel');
      await getHandler('gitorbit.git.tagDelete')({ label: 'v1.0.0' });

      expect(mockGitService.deleteTag).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('pushes a tag to the specified remote', async () => {
      await getHandler('gitorbit.git.tagPush')({ name: 'v1.0.0', remote: 'upstream' });

      expect(mockGitService.pushTag).toHaveBeenCalledWith('v1.0.0', 'upstream', undefined);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('fetches using the item remote and repo', async () => {
    const repo = { rootDir: '/repo' };
    await getHandler('gitorbit.git.fetch')({ remote: 'upstream', repo });

    expect(mockGitService.fetchRemote).toHaveBeenCalledWith('upstream', repo);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
