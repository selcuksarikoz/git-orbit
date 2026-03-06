import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GitGraphPanel } from '../../panels/GitGraphPanel';
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
    withProgress: vi.fn((options, task) => task()),
  },
  ViewColumn: { One: 1 },
  ProgressLocation: { Notification: 15 },
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      ensureInitialized: vi.fn(),
      getSelectedRepository: vi.fn(),
      getDefaultRepository: vi.fn().mockReturnValue({
          rootDir: '/test',
          executor: {
              exec: vi.fn().mockResolvedValue({ stdout: '' })
          }
      }),
      getBranches: vi.fn().mockResolvedValue({ all: ['main'], current: 'main' }),
      pull: vi.fn(),
      push: vi.fn(),
    }),
  },
}));

describe('GitGraphPanel', () => {
  let mockExtensionUri: any;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    GitGraphPanel.currentPanel = undefined;
    mockExtensionUri = vscode.Uri.file('/extension');
    mockGitService = GitService.getInstance();
  });

  it('should create a new panel', () => {
    GitGraphPanel.createOrShow(mockExtensionUri);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(GitGraphPanel.currentPanel).toBeDefined();
  });

  it('should handle ready message and load branches', async () => {
    GitGraphPanel.createOrShow(mockExtensionUri);
    const panel = (GitGraphPanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

    await messageHandler({ command: 'ready' });
    
    expect(mockGitService.getBranches).toHaveBeenCalled();
    expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      command: 'updateBranches',
      branches: expect.any(Array),
    }));
  });

  it('should handle loadBranch message and load commits', async () => {
    GitGraphPanel.createOrShow(mockExtensionUri);
    const panel = (GitGraphPanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

    const repo = mockGitService.getDefaultRepository();
    repo.executor.exec.mockResolvedValueOnce({ 
        stdout: 'hash1|short1|parent1|author1|1234567890|message1\n' 
    });
    repo.executor.exec.mockResolvedValueOnce({ stdout: '' }); // files for commit

    await messageHandler({ command: 'loadBranch', branch: 'main' });
    
    expect(repo.executor.exec).toHaveBeenCalledWith(expect.arrayContaining(['log', 'main']));
    expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      command: 'updateCommits',
      commits: expect.any(Array),
    }));
  });

  it('should handle pull, push, and sync messages', async () => {
    GitGraphPanel.createOrShow(mockExtensionUri);
    const panel = (GitGraphPanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

    await messageHandler({ command: 'pull', branch: 'main' });
    expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'main', expect.anything());

    await messageHandler({ command: 'push', branch: 'main' });
    expect(mockGitService.push).toHaveBeenCalledWith('origin', 'main', false, expect.anything());

    await messageHandler({ command: 'sync', branch: 'main' });
    expect(mockGitService.pull).toHaveBeenCalled();
    expect(mockGitService.push).toHaveBeenCalled();
  });
});
