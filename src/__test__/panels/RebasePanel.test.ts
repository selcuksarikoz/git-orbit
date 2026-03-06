import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { RebasePanel } from '../../panels/RebasePanel';
import { GitService } from '../../services/GitService';

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn().mockReturnValue({
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
      webview: {
        onDidReceiveMessage: vi.fn(),
        postMessage: vi.fn(),
        html: '',
      },
      dispose: vi.fn(),
    }),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    withProgress: vi.fn((options, task) => {
      const mockProgress = { report: vi.fn() };
      return task(mockProgress as any).then(() => {
        return { message: 'complete' };
      });
    }),
    activeTextEditor: { viewColumn: 1 },
  },
  ViewColumn: { One: 1 },
  ProgressLocation: { Notification: 15 },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
    joinPath: vi.fn((uri, ...parts) => ({ ...uri, fsPath: uri.fsPath + '/' + parts.join('/') })),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getLog: vi.fn().mockResolvedValue({ all: [{ hash: 'abc123', message: 'test' }] }),
      abortRebase: vi.fn(),
    }),
  },
}));

describe('RebasePanel', () => {
  let mockExtensionUri: any;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    RebasePanel.currentPanel = undefined;
    mockExtensionUri = vscode.Uri.file('/extension');
    mockGitService = GitService.getInstance();
  });

  it('should create a new panel', async () => {
    await RebasePanel.createOrShow(mockExtensionUri);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(RebasePanel.currentPanel).toBeDefined();
  });

  it('should handle abort message', async () => {
    await RebasePanel.createOrShow(mockExtensionUri);
    const panel = (RebasePanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

    await messageHandler({ type: 'abort' });

    expect(mockGitService.abortRebase).toHaveBeenCalled();
    expect(RebasePanel.currentPanel).toBeUndefined();
  });

  it('should handle rebase message', async () => {
    await RebasePanel.createOrShow(mockExtensionUri);
    const panel = (RebasePanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Yes, Start Rebase' as any);

    await messageHandler({ type: 'rebase', commits: [{ hash: 'abc123', action: 'pick' }] });

    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    expect(vscode.window.withProgress).toHaveBeenCalled();
    // Note: dispose is called after 2 second timeout in actual implementation
    // For testing purposes, we just verify the flow was triggered
  });
});
