import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { BlamePanel } from '../../panels/BlamePanel';
import { GitService } from '../../services/GitService';

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn().mockReturnValue({
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
      webview: {
        onDidReceiveMessage: vi.fn(),
        html: '',
        cspSource: 'vscode-resource:',
        postMessage: vi.fn(),
      },
      dispose: vi.fn(),
    }),
    activeTextEditor: {
      document: { uri: { fsPath: '/test/file.ts' } },
    },
  },
  ViewColumn: { Beside: 2, One: 1 },
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    parse: vi.fn((url) => ({ fsPath: url, scheme: 'https' })),
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
    joinPath: vi.fn(),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getBlame: vi.fn().mockResolvedValue(''),
    }),
  },
}));

describe('BlamePanel', () => {
  let mockBlameInfo: any;
  let mockExtensionUri: any;

  beforeEach(() => {
    vi.clearAllMocks();
    BlamePanel.currentPanel = undefined;
    mockBlameInfo = {
      hash: 'abc123',
      shortHash: 'abc',
      author: 'John',
      authorEmail: 'john@example.com',
      authorTime: 1234567890,
      summary: 'test',
      lineNumber: 1,
      lineContent: 'content',
    };
    mockExtensionUri = vscode.Uri.file('/extension');
  });

  it('should create a new panel if none exists', () => {
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(BlamePanel.currentPanel).toBeDefined();
  });

  it('should reveal existing panel if it exists', () => {
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    const firstPanel = BlamePanel.currentPanel;
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(
      firstPanel?.[Object.getOwnPropertySymbols(firstPanel as any)[0]]?.reveal
    ).toBeUndefined(); // reveal is on the panel
  });

  it('should handle messages from webview', async () => {
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    const panel = (BlamePanel as any).currentPanel._panel;
    const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

    await messageHandler({ command: 'viewDiff', hash: 'abc123' });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('gitorbit.openCommitDiffs', {
      hash: 'abc123',
    });

    await messageHandler({ command: 'copyHash', hash: 'abc123' });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'gitorbit.copyCommitHash',
      'abc123'
    );
  });

  it('should dispose correctly', () => {
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    const panel = BlamePanel.currentPanel;
    panel?.dispose();
    expect(BlamePanel.currentPanel).toBeUndefined();
  });

  it('should render a nonce-based CSP without inline event handlers', () => {
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    const html = (BlamePanel.currentPanel as any)._getHtmlForWebview(mockBlameInfo, []);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'nonce-");
    expect(html).toContain('<script nonce=');
    expect(html).not.toContain('onclick=');
  });

  it('should escape blame author in text and attributes', () => {
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    const malicious = { ...mockBlameInfo, author: '"><img src=x onerror=alert(1)>' };
    const html = (BlamePanel.currentPanel as any)._getHtmlForWebview(malicious, []);
    expect(html).not.toContain('alt=""><img');
    expect(html).toContain('alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    expect(html).toContain(
      'class="author-name">&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</div>'
    );
  });

  it('should escape file history commit author', () => {
    BlamePanel.createOrShow(mockExtensionUri, mockBlameInfo);
    const fileBlameData = [
      {
        hash: 'a'.repeat(40),
        shortHash: 'aaaaaaa',
        author: '"><script>alert(1)</script>',
        authorEmail: 'a@b.c',
        authorTime: 1234567890,
        summary: 'summary',
        lines: [1],
      },
    ];
    const html = (BlamePanel.currentPanel as any)._getHtmlForWebview(mockBlameInfo, fileBlameData);
    expect(html).not.toContain('alt=""><script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
