import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { PullRequestView } from '../../webviews/PullRequestView';
import { PullRequestService } from '../../services/PullRequestService';

// Mock vscode
vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: { viewColumn: 1 },
      createWebviewPanel: vi.fn().mockReturnValue({
        webview: {
          html: '',
          onDidReceiveMessage: vi.fn(),
          postMessage: vi.fn(),
          cspSource: 'vscode-resource:',
        },
        onDidDispose: vi.fn(),
        reveal: vi.fn(),
      }),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    ViewColumn: { One: 1 },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
      parse: (p: string) => ({ fsPath: p, scheme: 'https' }),
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

// Mock PullRequestService
vi.mock('../../services/PullRequestService', () => ({
  PullRequestService: {
    getInstance: vi.fn().mockReturnValue({
      getPRDetails: vi.fn().mockResolvedValue({
        number: 1,
        title: 'test',
        author: { login: 'user' },
        state: 'open',
        createdAt: new Date().toISOString(),
        body: '',
        headRef: 'h',
        baseRef: 'b',
        additions: 1,
        deletions: 1,
        changedFiles: 1,
        mergeable: true,
        reviewers: [],
        comments: [],
        files: [],
      }),
      getCollaborators: vi.fn().mockResolvedValue([]),
    }),
  },
}));

describe('PullRequestView', () => {
  let mockContext: any;
  let mockPR: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (PullRequestView as any).panels = new Map();

    mockContext = {
      subscriptions: [],
    };
    mockPR = {
      number: 1,
      title: 'Test PR',
      repo: { rootDir: '/test' },
      url: 'https://github.com/test/pr/1',
    };
  });

  it('should create and show PR panel', async () => {
    await PullRequestView.show(mockContext, mockPR);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'gitorbit.prView',
      'PR #1: Test PR',
      1,
      expect.any(Object)
    );
    expect(PullRequestService.getInstance().getPRDetails).toHaveBeenCalled();
  });

  it('should reveal existing panel', async () => {
    const mockPanel = { reveal: vi.fn() };
    (PullRequestView as any).panels.set(1, mockPanel);

    await PullRequestView.show(mockContext, mockPR);

    expect(mockPanel.reveal).toHaveBeenCalled();
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });

  const baseDetails = () => ({
    number: 1,
    title: 'x',
    author: { login: 'u' },
    state: 'open',
    createdAt: new Date().toISOString(),
    body: '',
    headRef: 'h',
    baseRef: 'b',
    additions: 0,
    deletions: 0,
    changedFiles: 1,
    mergeable: false,
    reviewers: [],
    comments: [],
    files: [],
  });

  it('should use a nonce-based CSP without inline event handlers', () => {
    const html = (PullRequestView as any).getHtmlContent(baseDetails(), [], 1, {
      cspSource: 'vscode-resource:',
    });
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'nonce-");
    expect(html).toContain('<script nonce=');
    expect(html).not.toContain('onclick=');
  });

  it('should escape all interpolated PR data', () => {
    const details = {
      ...baseDetails(),
      author: { login: 'u"><img src=x onerror=alert(1)>' },
      headRef: '<script>x</script>',
      reviewers: [
        {
          login: 'r"><script>alert(1)</script>',
          avatarUrl: 'x" onerror="alert(1)',
          state: 'APPROVED',
        },
      ],
      comments: [{ author: '<img src=x>', body: 'b', createdAt: new Date().toISOString() }],
      files: [{ filename: "a';alert(1)//.ts", status: 'added', additions: 1, deletions: 0 }],
    };
    const html = (PullRequestView as any).getHtmlContent(details, [], 1, {
      cspSource: 'vscode-resource:',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('src="x" onerror="alert(1)"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('data-file="a&#039;;alert(1)//.ts"');
    expect(html).toContain(
      'data-remove-reviewer="r&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'
    );
  });

  it('should scope panel listeners to the panel instead of global subscriptions', async () => {
    await PullRequestView.show(mockContext, mockPR);
    expect(mockContext.subscriptions).toHaveLength(0);

    const panel = (vscode.window.createWebviewPanel as any).mock.results[0].value;
    const onDispose = panel.onDidDispose.mock.calls[0][0];
    onDispose();
    expect((PullRequestView as any).panels.has(1)).toBe(false);
  });
});
