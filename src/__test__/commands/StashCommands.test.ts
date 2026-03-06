vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInputBox: vi.fn(),
  },
  ExtensionContext: class MockExtensionContext {
    subscriptions: any[] = [];
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      stashSave: vi.fn(),
      stashApply: vi.fn(),
      stashPop: vi.fn(),
      stashDrop: vi.fn(),
    }),
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { StashCommands } from '../../commands/StashCommands';

describe('StashCommands', () => {
  let stashCommands: StashCommands;
  let mockRefreshCallback: ReturnType<typeof vi.fn>;
  let mockShowInputBox: any;
  let mockShowWarningMessage: any;
  let mockGitService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    (StashCommands as any).instance = undefined;
    mockRefreshCallback = vi.fn();
    mockShowInputBox = vscode.window.showInputBox;
    mockShowWarningMessage = vscode.window.showWarningMessage;
    stashCommands = StashCommands.getInstance(mockRefreshCallback);
    const { GitService } = await import('../../services/GitService');
    mockGitService = GitService.getInstance() as any;
  });

  afterEach(() => {
    (StashCommands as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should throw error when initialized without refresh callback', () => {
      (StashCommands as any).instance = undefined;
      expect(() => StashCommands.getInstance()).toThrow(
        'StashCommands initialized without refresh callback'
      );
    });

    it('should return singleton instance', () => {
      const instance1 = StashCommands.getInstance(mockRefreshCallback);
      const instance2 = StashCommands.getInstance(mockRefreshCallback);
      expect(instance1).toBe(instance2);
    });
  });

  describe('register', () => {
    it('should register all stash commands', () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);
      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(4);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.saveStash',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.stashApply',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.stashPop',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.stashDrop',
        expect.any(Function)
      );
    });
  });

  describe('saveStash', () => {
    it('should save stash with message when user provides one', async () => {
      mockShowInputBox.mockResolvedValue('my stash message');
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const saveStashFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.saveStash'
      )[1];

      await saveStashFn();

      expect(mockShowInputBox).toHaveBeenCalledWith({
        prompt: 'Stash message (optional)',
      });
      expect(mockGitService?.stashSave).toHaveBeenCalledWith('my stash message', true);
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should save stash with empty message when user cancels', async () => {
      mockShowInputBox.mockResolvedValue('');
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const saveStashFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.saveStash'
      )[1];

      await saveStashFn();

      expect(mockShowInputBox).toHaveBeenCalled();
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should not save stash when user cancels input', async () => {
      mockShowInputBox.mockResolvedValue(undefined);
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const saveStashFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.saveStash'
      )[1];

      await saveStashFn();

      expect(mockShowInputBox).toHaveBeenCalled();
      expect(mockRefreshCallback).not.toHaveBeenCalled();
    });
  });

  describe('stashApply', () => {
    it('should apply stash and refresh', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashApplyFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashApply'
      )[1];

      await stashApplyFn({ index: 2 });

      expect(mockGitService?.stashApply).toHaveBeenCalledWith(2);
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should do nothing when item is null', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashApplyFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashApply'
      )[1];

      await stashApplyFn(null);

      expect(mockGitService?.stashApply).not.toHaveBeenCalled();
      expect(mockRefreshCallback).not.toHaveBeenCalled();
    });

    it('should do nothing when index is undefined', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashApplyFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashApply'
      )[1];

      await stashApplyFn({});

      expect(mockGitService?.stashApply).not.toHaveBeenCalled();
      expect(mockRefreshCallback).not.toHaveBeenCalled();
    });
  });

  describe('stashPop', () => {
    it('should pop stash and refresh', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashPopFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashPop'
      )[1];

      await stashPopFn({ index: 1 });

      expect(mockGitService?.stashPop).toHaveBeenCalledWith(1);
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should do nothing when item is null', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashPopFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashPop'
      )[1];

      await stashPopFn(null);

      expect(mockGitService?.stashPop).not.toHaveBeenCalled();
      expect(mockRefreshCallback).not.toHaveBeenCalled();
    });

    it('should do nothing when index is undefined', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashPopFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashPop'
      )[1];

      await stashPopFn({});

      expect(mockGitService?.stashPop).not.toHaveBeenCalled();
      expect(mockRefreshCallback).not.toHaveBeenCalled();
    });
  });

  describe('stashDrop', () => {
    it('should drop stash when user confirms', async () => {
      mockShowWarningMessage.mockResolvedValue('Delete');
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashDropFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashDrop'
      )[1];

      await stashDropFn({ index: 0, label: 'stash@{0}' });

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Delete stash stash@{0}?',
        'Delete',
        'Cancel'
      );
      expect(mockGitService?.stashDrop).toHaveBeenCalledWith(0);
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should not drop stash when user cancels', async () => {
      mockShowWarningMessage.mockResolvedValue('Cancel');
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashDropFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashDrop'
      )[1];

      await stashDropFn({ index: 0, label: 'stash@{0}' });

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Delete stash stash@{0}?',
        'Delete',
        'Cancel'
      );
      expect(mockGitService?.stashDrop).not.toHaveBeenCalled();
      expect(mockRefreshCallback).not.toHaveBeenCalled();
    });

    it('should do nothing when item is null', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashDropFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashDrop'
      )[1];

      await stashDropFn(null);

      expect(mockShowWarningMessage).not.toHaveBeenCalled();
      expect(mockGitService?.stashDrop).not.toHaveBeenCalled();
    });

    it('should do nothing when index is undefined', async () => {
      const context = new vscode.ExtensionContext();
      stashCommands.register(context);

      const stashDropFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.stashDrop'
      )[1];

      await stashDropFn({});

      expect(mockShowWarningMessage).not.toHaveBeenCalled();
      expect(mockGitService?.stashDrop).not.toHaveBeenCalled();
    });
  });
});
