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
  env: {
    clipboard: {
      writeText: vi.fn(),
    },
  },
  ExtensionContext: class MockExtensionContext {
    subscriptions: any[] = [];
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getRepositoryByRoot: vi.fn(),
      getRemoteUrl: vi.fn(),
    }),
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { CopyCommands } from '../../commands/CopyCommands';

describe('CopyCommands', () => {
  let copyCommands: CopyCommands;
  let mockClipboard: any;
  let mockShowInformationMessage: any;
  let mockShowWarningMessage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (CopyCommands as any).instance = undefined;
    copyCommands = CopyCommands.getInstance();
    mockClipboard = vscode.env.clipboard;
    mockShowInformationMessage = vscode.window.showInformationMessage;
    mockShowWarningMessage = vscode.window.showWarningMessage;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CopyCommands.getInstance();
      const instance2 = CopyCommands.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('register', () => {
    it('should register all copy commands', () => {
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);
      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(6);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.copy.hash',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.copy.message',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.copy.author',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.copy.email',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.copy.date',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'gitorbit.copy.url',
        expect.any(Function)
      );
    });
  });

  describe('copyHash', () => {
    it('should copy commit hash to clipboard', async () => {
      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyHashFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.hash'
      )[1];

      await copyHashFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('abc123');
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Commit Hash copied to clipboard.');
    });

    it('should do nothing when hash is missing', async () => {
      const item = {};
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyHashFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.hash'
      )[1];

      await copyHashFn(item);

      expect(mockClipboard.writeText).not.toHaveBeenCalled();
      expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });
  });

  describe('copyMessage', () => {
    it('should copy commit message from label', async () => {
      const item = { label: 'Commit message here', hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyMessageFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.message'
      )[1];

      await copyMessageFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('Commit message here');
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        'Commit Message copied to clipboard.'
      );
    });

    it('should copy commit message from message property', async () => {
      const item = { message: 'Direct message', hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyMessageFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.message'
      )[1];

      await copyMessageFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('Direct message');
    });

    it('should show warning when no message', async () => {
      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyMessageFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.message'
      )[1];

      await copyMessageFn(item);

      expect(mockShowWarningMessage).toHaveBeenCalledWith('No Commit Message to copy.');
      expect(mockClipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe('copyAuthor', () => {
    it('should copy author from authorName property', async () => {
      const item = { authorName: 'John Doe', hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyAuthorFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.author'
      )[1];

      await copyAuthorFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('John Doe');
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Author Name copied to clipboard.');
    });

    it('should extract author from description', async () => {
      const item = { description: 'John Doe • 2023-01-01', hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyAuthorFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.author'
      )[1];

      await copyAuthorFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('John Doe');
    });

    it('should show warning when no author', async () => {
      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyAuthorFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.author'
      )[1];

      await copyAuthorFn(item);

      expect(mockShowWarningMessage).toHaveBeenCalledWith('No Author Name to copy.');
    });
  });

  describe('copyEmail', () => {
    it('should copy author email', async () => {
      const item = { authorEmail: 'john@example.com', hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyEmailFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.email'
      )[1];

      await copyEmailFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('john@example.com');
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Author Email copied to clipboard.');
    });

    it('should show warning when no email', async () => {
      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyEmailFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.email'
      )[1];

      await copyEmailFn(item);

      expect(mockShowWarningMessage).toHaveBeenCalledWith('No Author Email to copy.');
    });
  });

  describe('copyDate', () => {
    it('should copy date from dateString property', async () => {
      const item = { dateString: '2023-01-01', hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyDateFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.date'
      )[1];

      await copyDateFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('2023-01-01');
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Commit Date copied to clipboard.');
    });

    it('should extract date from description', async () => {
      const item = { description: 'John Doe • 2023-01-01', hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyDateFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.date'
      )[1];

      await copyDateFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('2023-01-01');
    });

    it('should show warning when no date', async () => {
      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyDateFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.date'
      )[1];

      await copyDateFn(item);

      expect(mockShowWarningMessage).toHaveBeenCalledWith('No Commit Date to copy.');
    });
  });

  describe('copyUrl', () => {
    it('should generate and copy commit URL from git SSH URL', async () => {
      const { GitService } = await import('../../services/GitService');
      const mockGitService = GitService.getInstance() as any;
      mockGitService.getRemoteUrl.mockResolvedValue('git@github.com:user/repo.git');

      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyUrlFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.url'
      )[1];

      await copyUrlFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        'https://github.com/user/repo/commit/abc123'
      );
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Commit URL copied to clipboard.');
    });

    it('should generate and copy commit URL from HTTPS URL', async () => {
      const { GitService } = await import('../../services/GitService');
      const mockGitService = GitService.getInstance() as any;
      mockGitService.getRemoteUrl.mockResolvedValue('https://github.com/user/repo.git');

      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyUrlFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.url'
      )[1];

      await copyUrlFn(item);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        'https://github.com/user/repo/commit/abc123'
      );
    });

    it('should show warning when no remote URL', async () => {
      const { GitService } = await import('../../services/GitService');
      const mockGitService = GitService.getInstance() as any;
      mockGitService.getRemoteUrl.mockResolvedValue(undefined);

      const item = { hash: 'abc123' };
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyUrlFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.url'
      )[1];

      await copyUrlFn(item);

      expect(mockShowWarningMessage).toHaveBeenCalledWith('No remote URL found.');
      expect(mockClipboard.writeText).not.toHaveBeenCalled();
    });

    it('should show error when hash is missing', async () => {
      const item = {};
      const context = new vscode.ExtensionContext();
      copyCommands.register(context);

      const copyUrlFn = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: any[]) => call[0] === 'gitorbit.copy.url'
      )[1];

      await copyUrlFn(item);

      expect(mockClipboard.writeText).not.toHaveBeenCalled();
      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
  });
});
