import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { CommitChatPanel } from '../../panels/CommitChatPanel';
import { GitService } from '../../services/GitService';
import { AIService } from '../../services/AIService';

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn().mockReturnValue({
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
      webview: {
        onDidReceiveMessage: vi.fn(),
        postMessage: vi.fn(),
        asWebviewUri: vi.fn((uri) => uri),
        html: '',
      },
      dispose: vi.fn(),
    }),
    activeTextEditor: { viewColumn: 1 },
  },
  ViewColumn: { One: 1 },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
    joinPath: vi.fn((uri, ...parts) => ({ ...uri, fsPath: uri.fsPath + '/' + parts.join('/') })),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getTruncatedCommitDiff: vi.fn().mockResolvedValue('diff content'),
      getUserInfo: vi.fn().mockResolvedValue({ name: 'John', email: 'john@example.com' }),
    }),
  },
}));

vi.mock('../../services/AIService', () => ({
  AIService: {
    getInstance: vi.fn().mockReturnValue({
      streamChat: vi.fn().mockResolvedValue({
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('Hello') })
            .mockResolvedValueOnce({ done: true }),
        }),
      }),
    }),
  },
}));

describe('CommitChatPanel', () => {
  let mockExtensionUri: any;

  beforeEach(() => {
    vi.clearAllMocks();
    CommitChatPanel.currentPanel = undefined;
    mockExtensionUri = vscode.Uri.file('/extension');
  });

  it('should create a new panel if none exists', async () => {
    await CommitChatPanel.createOrShow(mockExtensionUri, 'abc123', 'initial message');
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(CommitChatPanel.currentPanel).toBeDefined();
  });

  it('should handle sendMessage message', async () => {
    await CommitChatPanel.createOrShow(mockExtensionUri, 'abc123', 'initial message');
    const panel = (CommitChatPanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

    await messageHandler({ type: 'sendMessage', text: 'How are you?' });
    
    expect(AIService.getInstance().streamChat).toHaveBeenCalled();
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'receiveToken',
      token: 'Hello',
    });
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ type: 'streamComplete' });
  });

  it('should handle stopGeneration message', async () => {
    await CommitChatPanel.createOrShow(mockExtensionUri, 'abc123', 'initial message');
    const panel = (CommitChatPanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

    // Simulate an active abort controller by starting a sendMessage
    const streamChatPromise = messageHandler({ type: 'sendMessage', text: 'How are you?' });
    
    await messageHandler({ type: 'stopGeneration' });
    
    // The abort controller should be triggered (not easily testable without exposing it, but we can check if it finishes)
    await streamChatPromise;
  });

  it('should dispose correctly', async () => {
    await CommitChatPanel.createOrShow(mockExtensionUri, 'abc123', 'initial message');
    const panel = CommitChatPanel.currentPanel;
    panel?.dispose();
    expect(CommitChatPanel.currentPanel).toBeUndefined();
  });
});
